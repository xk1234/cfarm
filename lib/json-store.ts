import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import {
  ID_KEYS,
  NAME_KEYS,
  ownedRowIdFor,
  pickField,
  rowIdFor,
  routeForStore,
  type StoreRoute,
} from "@/lib/appwrite-stores"
import {
  canonicalRowFields,
  extractOutputMedia,
  hydrateOutputMedia,
  outputMediaRowFields,
  outputMediaRowId,
  type OutputMediaDraft,
} from "@/lib/consolidated-records"
import { getCurrentUser } from "@/lib/auth"
import { sharedOwnerIdsFor } from "@/lib/workspace-members"
import { systemOwnerId } from "@/lib/system-owner-context"

type JsonArrayStoreInput<T> = {
  rootDir: string
  fileName: string
  key: string
  normalize?: (record: T) => T | null
  queries?: string[]
  limit?: number
  order?: "asc" | "desc" | "none"
}

type JsonRecordStoreInput<T> = JsonArrayStoreInput<T> & {
  record: T
  position?: "first" | "last"
}

type JsonArrayStoreUpdate<T, R> = {
  records: T[]
  result?: R
}

const storeLocks = new Map<string, Promise<void>>()

// ---------------------------------------------------------------------------
// Appwrite-only record store. There is no filesystem fallback: every mapped
// store lives in Appwrite TablesDB. Unconfigured Appwrite or an unmapped store
// is a hard error rather than a silent local write.
// ---------------------------------------------------------------------------

export async function readJsonArrayStore<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  const route = requireRouteFor(input)
  return awReadTable<T>(route, input.normalize, await ownersForRead(route), {
    queries: input.queries,
    limit: input.limit,
    order: input.order,
  })
}

/** Count matching physical rows without hydrating their JSON payloads. */
export async function countJsonArrayStore<T>(
  input: JsonArrayStoreInput<T>
): Promise<number> {
  const route = requireRouteFor(input)
  const ownerIds = await ownersForRead(route)
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const queries = [...(input.queries ?? []), Query.limit(1)]
  if (isConsolidated(route)) {
    queries.unshift(Query.equal("source_key", [route.sourceKey]))
  }
  if (ownerIds?.length) {
    queries.unshift(Query.equal("owner_id", ownerIds))
  }
  const response = await aw.tables.listRows(
    APPWRITE_DATABASE_ID,
    route.table,
    queries
  )
  return response.total
}

/** Read one deterministic domain record without scanning its table. */
export async function readJsonArrayRecord<T>(
  input: JsonArrayStoreInput<T> & { id: string }
): Promise<T | null> {
  const route = requireRouteFor(input)
  const ownerIds = await ownersForRead(route)
  const rowIds = ownerIds?.length
    ? ownerIds.map((ownerId) => storeOwnedRowId(route, ownerId, input.id, 0))
    : [storeRowId(route, input.id, 0)]
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")

  for (const rowId of rowIds) {
    try {
      const row = (await aw.tables.getRow(
        APPWRITE_DATABASE_ID,
        route.table,
        rowId
      )) as Record<string, unknown>
      const media =
        route.table === "outputs"
          ? await listOutputMedia(aw, [String(row.$id)])
          : []
      return parseStoredRow(row, route, input.normalize, media)
    } catch (error) {
      if (appwriteStatus(error) !== 404) throw error
    }
  }
  return null
}

export async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  await withStoreLock(
    `aw:${route.table}:${route.sourceKey}:${ownerId ?? "public"}`,
    async () => {
      await awWriteTable(route, input.records, ownerId)
    }
  )
}

/**
 * Upsert one domain record without rewriting every row in the table. New rows
 * sort first by default, matching the historical array-store prepend behavior.
 */
export async function upsertJsonArrayRecord<T>(
  input: JsonRecordStoreInput<T>
): Promise<void> {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  const rid = pickField(input.record, ID_KEYS)
  if (!rid) {
    throw new Error(`A record id is required to upsert into ${route.table}.`)
  }
  await awUpsertRecord(
    route,
    input.record,
    rid,
    ownerId,
    input.position ?? "first"
  )
}

/**
 * Append domain records without reading or rewriting the rest of the table.
 * Existing ids are left untouched, which makes deterministic event ids an
 * idempotent append boundary for snapshot and ledger-style stores.
 */
export async function appendJsonArrayRecords<T>(
  input: JsonArrayStoreInput<T> & { records: T[] }
): Promise<void> {
  if (input.records.length === 0) return
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  await withStoreLock(
    `aw:${route.table}:${route.sourceKey}:${ownerId ?? "public"}`,
    async () => {
      await runPool(input.records, 3, async (record) => {
        const rid = pickField(record, ID_KEYS)
        if (!rid) {
          throw new Error(
            `A record id is required to append into ${route.table}.`
          )
        }
        await awAppendRecord(route, record, rid, ownerId)
      })
    }
  )
}

/** Delete one domain record by id without synchronizing the rest of the table. */
export async function deleteJsonArrayRecord(input: {
  rootDir: string
  fileName: string
  key: string
  id: string
}): Promise<boolean> {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  const rowId = ownerId
    ? storeOwnedRowId(route, ownerId, input.id, 0)
    : storeRowId(route, input.id, 0)
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  try {
    await retryTransient(() =>
      aw.tables.deleteRow(APPWRITE_DATABASE_ID, route.table, rowId)
    )
    if (route.table === "outputs") await deleteOutputMedia(aw, [rowId])
    return true
  } catch (error) {
    if (appwriteStatus(error) === 404) return false
    throw error
  }
}

export async function withJsonArrayStore<T, R = void>(
  input: JsonArrayStoreInput<T> & {
    update: (
      records: T[]
    ) => JsonArrayStoreUpdate<T, R> | Promise<JsonArrayStoreUpdate<T, R>>
  }
): Promise<R> {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  return withStoreLock(
    `aw:${route.table}:${route.sourceKey}:${ownerId ?? "public"}`,
    async () => {
      const records = await awReadTable<T>(
        route,
        input.normalize,
        ownerId ? [ownerId] : null
      )
      const next = await input.update(records)
      await awWriteTable(route, next.records, ownerId)
      return next.result as R
    }
  )
}

// ---------------------------------------------------------------------------
// Routing (Appwrite required)
// ---------------------------------------------------------------------------

function requireRouteFor(input: {
  rootDir: string
  fileName: string
}): StoreRoute {
  if (!getAppwrite()) {
    throw new Error(
      "Appwrite is not configured. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY — this app is Appwrite-only and has no filesystem fallback."
    )
  }
  const route = routeForStore(input.rootDir, input.fileName)
  if (!route) {
    throw new Error(
      `No Appwrite table is mapped for store "${input.fileName}". Add it to STORE_TABLES in lib/appwrite-stores.ts.`
    )
  }
  return route
}

// ---------------------------------------------------------------------------
// Appwrite TablesDB implementation
// ---------------------------------------------------------------------------

const PAGE = 100

async function awReadTable<T>(
  route: StoreRoute,
  normalize: ((record: T) => T | null) | undefined,
  ownerIds: string[] | null,
  options: {
    queries?: string[]
    limit?: number
    order?: "asc" | "desc" | "none"
  } = {}
): Promise<T[]> {
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("Appwrite is not configured.")
  }
  const out: T[] = []
  const requestedLimit = Number.isFinite(options.limit)
    ? Math.max(1, Math.floor(options.limit as number))
    : Number.POSITIVE_INFINITY
  let cursor: string | null = null
  for (;;) {
    const remaining = requestedLimit - out.length
    if (remaining <= 0) break
    const queries = [
      ...(options.queries ?? []),
      Query.limit(Math.min(PAGE, remaining)),
    ]
    if (isConsolidated(route)) {
      queries.unshift(Query.equal("source_key", [route.sourceKey]))
    }
    if (options.order !== "none") {
      queries.push(
        options.order === "desc"
          ? Query.orderDesc("ord")
          : Query.orderAsc("ord")
      )
    }
    if (ownerIds?.length) queries.unshift(Query.equal("owner_id", ownerIds))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      route.table,
      queries
    )
    const rows = res.rows as Array<Record<string, unknown>>
    const media =
      route.table === "outputs"
        ? await listOutputMedia(
            aw,
            rows.map((row) => String(row.$id))
          )
        : []
    for (const row of rows) {
      const parsed = parseStoredRow(row, route, normalize, media)
      if (parsed) out.push(parsed)
      if (out.length >= requestedLimit) break
    }
    if (rows.length < Math.min(PAGE, remaining)) break
    cursor = String(rows[rows.length - 1].$id)
  }
  return out
}

function parseStoredRow<T>(
  row: Record<string, unknown>,
  route: StoreRoute,
  normalize: ((record: T) => T | null) | undefined,
  media: HydratedOutputMedia[]
): T | null {
  const raw = typeof row.data === "string" ? row.data : "null"
  let parsed: T
  try {
    const decoded = JSON.parse(raw) as T
    parsed = (
      route.table === "outputs"
        ? hydrateOutputMedia(
            route.sourceKey,
            decoded,
            media.filter((item) => item.outputId === String(row.$id))
          )
        : decoded
    ) as T
  } catch {
    return null
  }
  if (parsed == null) return null
  return normalize ? normalize(parsed) : parsed
}

async function ownersForRead(route: StoreRoute): Promise<string[] | null> {
  if (route.public) return null
  const workerOwner = systemOwnerId()
  if (workerOwner) return [workerOwner]
  const user = await getCurrentUser()
  if (!user)
    throw new Error(`Authentication is required to access ${route.table}.`)
  if (!route.shareable) return [user.$id]
  return [user.$id, ...(await sharedOwnerIdsFor(user))]
}

async function awWriteTable<T>(
  route: StoreRoute,
  records: T[],
  ownerId: string | null
): Promise<void> {
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("Appwrite is not configured.")
  }

  const desired = records.map((rec, index) => {
    const rid = pickField(rec, ID_KEYS)
    const nameKey =
      route.sourceKey === "image_collection"
        ? normalizeStoreName(pickField(rec, NAME_KEYS))
        : ""
    const stableRid = rid ?? (nameKey || null)
    const ownedRecord = ownerId ? attachOwner(rec, ownerId) : rec
    const extracted =
      route.table === "outputs"
        ? extractOutputMedia(route.sourceKey, ownedRecord)
        : { storedData: ownedRecord, media: [] }
    return {
      id: ownerId
        ? storeOwnedRowId(route, ownerId, stableRid, index)
        : storeRowId(route, stableRid, index),
      nameKey,
      rid,
      media: extracted.media,
      payload: {
        rid: (stableRid ?? `idx-${index}`).slice(0, 1024),
        ...canonicalRowFields(route, rec, extracted.storedData),
        ord: index,
        ...(ownerId ? { owner_id: ownerId } : {}),
      },
    }
  })
  // Existing row ids (for deletion of removed records).
  const existingIds: string[] = []
  const existingImageCollectionIdsByName = new Map<string, string>()
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(PAGE)]
    if (isConsolidated(route)) {
      queries.unshift(Query.equal("source_key", [route.sourceKey]))
    }
    if (ownerId) queries.unshift(Query.equal("owner_id", [ownerId]))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      route.table,
      queries
    )
    const rows = res.rows as Array<Record<string, unknown>>
    for (const row of rows) {
      const rowId = String(row.$id)
      existingIds.push(rowId)
      if (route.sourceKey === "image_collection") {
        const nameKey = normalizeStoreName(
          typeof row.name === "string" ? row.name : ""
        )
        if (nameKey && !existingImageCollectionIdsByName.has(nameKey)) {
          existingImageCollectionIdsByName.set(nameKey, rowId)
        }
      }
    }
    if (rows.length < PAGE) break
    cursor = String(rows[rows.length - 1].$id)
  }

  // Keep each collection's physical Appwrite row stable when its domain id is
  // normalized or the list is reordered. Domain ids live inside the payload;
  // row ids are storage identities and do not need to match them.
  for (const item of desired) {
    if (!item.nameKey) continue
    item.id = existingImageCollectionIdsByName.get(item.nameKey) ?? item.id
  }
  const desiredIds = new Set(desired.map((d) => d.id))

  // Refuse catastrophic shrink BEFORE touching any row: a bulk write that
  // removes most of a table almost always means the caller's list came from a
  // stale or wrongly-scoped read (hot reload mid-refactor, owner mismatch),
  // not real intent. Explicit removals go through deleteJsonArrayRecord.
  const toDelete = existingIds.filter((id) => !desiredIds.has(id))
  if (toDelete.length > 10 && toDelete.length > existingIds.length / 2) {
    throw new Error(
      `Refusing bulk write to ${route.table}/${route.sourceKey}: it would delete ${toDelete.length} of ${existingIds.length} rows. ` +
        "If this shrink is intentional, remove records explicitly via deleteJsonArrayRecord."
    )
  }

  // Upsert desired rows (bounded concurrency).
  await runPool(desired, 3, async (d) => {
    await retryTransient(() =>
      aw.tables.upsertRow(APPWRITE_DATABASE_ID, route.table, d.id, d.payload)
    )
    if (route.table === "outputs") {
      if (!ownerId) throw new Error("Output records require an owner id.")
      await syncOutputMedia(aw, d.id, ownerId, d.media)
    }
  })

  // Delete rows no longer present.
  await runPool(toDelete, 3, async (id) => {
    await retryTransient(() =>
      aw.tables.deleteRow(APPWRITE_DATABASE_ID, route.table, id)
    )
    if (route.table === "outputs") await deleteOutputMedia(aw, [id])
  })
}

function normalizeStoreName(value: string | null) {
  return (value ?? "").trim().toLowerCase()
}

async function awUpsertRecord<T>(
  route: StoreRoute,
  record: T,
  rid: string,
  ownerId: string | null,
  position: "first" | "last"
) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const rowId = ownerId
    ? storeOwnedRowId(route, ownerId, rid, 0)
    : storeRowId(route, rid, 0)
  let existingOrd: number | null = null
  try {
    const existing = (await aw.tables.getRow(
      APPWRITE_DATABASE_ID,
      route.table,
      rowId
    )) as Record<string, unknown>
    existingOrd =
      typeof existing.ord === "number" && Number.isFinite(existing.ord)
        ? existing.ord
        : null
  } catch (error) {
    if (appwriteStatus(error) !== 404) throw error
  }
  const ownedRecord = ownerId ? attachOwner(record, ownerId) : record
  const extracted =
    route.table === "outputs"
      ? extractOutputMedia(route.sourceKey, ownedRecord)
      : { storedData: ownedRecord, media: [] }
  const ord = existingOrd ?? (position === "first" ? -Date.now() : Date.now())
  await retryTransient(() =>
    aw.tables.upsertRow(APPWRITE_DATABASE_ID, route.table, rowId, {
      rid: rid.slice(0, 1024),
      ...canonicalRowFields(route, record, extracted.storedData),
      ord,
      ...(ownerId ? { owner_id: ownerId } : {}),
    })
  )
  if (route.table === "outputs") {
    if (!ownerId) throw new Error("Output records require an owner id.")
    await syncOutputMedia(aw, rowId, ownerId, extracted.media)
  }
}

async function awAppendRecord<T>(
  route: StoreRoute,
  record: T,
  rid: string,
  ownerId: string | null
) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const rowId = ownerId
    ? storeOwnedRowId(route, ownerId, rid, 0)
    : storeRowId(route, rid, 0)
  const ownedRecord = ownerId ? attachOwner(record, ownerId) : record
  const extracted =
    route.table === "outputs"
      ? extractOutputMedia(route.sourceKey, ownedRecord)
      : { storedData: ownedRecord, media: [] }
  try {
    await retryTransient(() =>
      aw.tables.createRow(APPWRITE_DATABASE_ID, route.table, rowId, {
        rid: rid.slice(0, 1024),
        ...canonicalRowFields(route, record, extracted.storedData),
        ord: -Date.now(),
        ...(ownerId ? { owner_id: ownerId } : {}),
      })
    )
    if (route.table === "outputs") {
      if (!ownerId) throw new Error("Output records require an owner id.")
      await syncOutputMedia(aw, rowId, ownerId, extracted.media)
    }
  } catch (error) {
    if (appwriteStatus(error) === 409) return
    throw error
  }
}

function appwriteStatus(error: unknown) {
  if (!error || typeof error !== "object") return null
  const value = (error as { code?: unknown }).code
  return typeof value === "number" ? value : Number(value) || null
}

async function ownerForRoute(route: StoreRoute): Promise<string | null> {
  if (route.public) return null
  const workerOwner = systemOwnerId()
  if (workerOwner) return workerOwner
  try {
    const user = await getCurrentUser()
    if (user) return user.$id
  } catch {
    // Scripts and isolated store tests do not have a Next.js request context.
  }
  const systemOwner = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (systemOwner) return systemOwner
  throw new Error(`Authentication is required to access ${route.table}.`)
}

type AppwriteClients = NonNullable<ReturnType<typeof getAppwrite>>
type HydratedOutputMedia = OutputMediaDraft & { outputId: string }

function isConsolidated(route: StoreRoute): boolean {
  return route.table === "outputs" || route.table === "permanent_assets"
}

function storeRowNamespace(route: StoreRoute): string {
  return isConsolidated(route)
    ? `${route.table}:${route.sourceKey}`
    : route.table
}

function storeRowId(route: StoreRoute, rid: string | null, index: number) {
  return rowIdFor(storeRowNamespace(route), rid, index)
}

function storeOwnedRowId(
  route: StoreRoute,
  ownerId: string,
  rid: string | null,
  index: number
) {
  return ownedRowIdFor(storeRowNamespace(route), ownerId, rid, index)
}

async function listOutputMedia(
  aw: AppwriteClients,
  outputIds: string[]
): Promise<HydratedOutputMedia[]> {
  if (outputIds.length === 0) return []
  const records: HydratedOutputMedia[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [
      Query.equal("output_id", outputIds),
      Query.orderAsc("position"),
      Query.limit(PAGE),
    ]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "output_media",
      queries
    )
    for (const row of response.rows as Array<Record<string, unknown>>) {
      const url = typeof row.url === "string" ? row.url : ""
      const role = typeof row.role === "string" ? row.role : "file"
      const rawKind = typeof row.kind === "string" ? row.kind : "file"
      const kind =
        rawKind === "image" || rawKind === "video" || rawKind === "audio"
          ? rawKind
          : "file"
      records.push({
        outputId: String(row.output_id ?? ""),
        kind,
        role,
        position:
          typeof row.position === "number" && Number.isFinite(row.position)
            ? row.position
            : 0,
        url,
      })
    }
    if (response.rows.length < PAGE) break
    cursor = String(response.rows.at(-1)?.$id ?? "")
  }
  return records
}

async function syncOutputMedia(
  aw: AppwriteClients,
  outputRowId: string,
  ownerId: string,
  media: OutputMediaDraft[]
) {
  await deleteOutputMedia(aw, [outputRowId])
  await runPool(media, 3, async (item) => {
    await retryTransient(() =>
      aw.tables.createRow(
        APPWRITE_DATABASE_ID,
        "output_media",
        outputMediaRowId(outputRowId, item),
        outputMediaRowFields(outputRowId, ownerId, item)
      )
    )
  })
}

async function deleteOutputMedia(aw: AppwriteClients, outputIds: string[]) {
  if (outputIds.length === 0) return
  let cursor: string | null = null
  const ids: string[] = []
  for (;;) {
    const queries = [Query.equal("output_id", outputIds), Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "output_media",
      queries
    )
    ids.push(...response.rows.map((row) => row.$id))
    if (response.rows.length < PAGE) break
    cursor = response.rows.at(-1)?.$id ?? null
  }
  await runPool(ids, 3, async (id) => {
    await retryTransient(() =>
      aw.tables.deleteRow(APPWRITE_DATABASE_ID, "output_media", id)
    )
  })
}

function attachOwner<T>(record: T, ownerId: string): T {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record
  }
  return { ...(record as Record<string, unknown>), ownerId } as T
}

async function retryTransient<T>(task: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      const code = String(
        (error as { code?: unknown; cause?: { code?: unknown } }).cause?.code ??
          (error as { code?: unknown }).code ??
          ""
      )
      if (
        !/EADDRNOTAVAIL|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(code) ||
        attempt === 2
      ) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
    }
  }
  throw lastError
}

async function runPool<I>(
  items: I[],
  concurrency: number,
  task: (item: I) => Promise<void>
): Promise<void> {
  let index = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = items[index++]
        await task(current)
      }
    }
  )
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// In-process write serialization (per table)
// ---------------------------------------------------------------------------

async function withStoreLock<T>(
  lockKey: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = storeLocks.get(lockKey) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  const next = run.then(
    () => undefined,
    () => undefined
  )
  storeLocks.set(lockKey, next)
  await next.finally(() => {
    if (storeLocks.get(lockKey) === next) {
      storeLocks.delete(lockKey)
    }
  })
  return run
}
