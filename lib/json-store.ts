import {
  ID_KEYS,
  NAME_KEYS,
  STATUS_KEYS,
  ownedRowIdFor,
  pickField,
  rowIdFor,
  routeForStore,
  type StoreRoute,
} from "@/lib/store-identity"
import { getCurrentUser } from "@/lib/auth"
import {
  extractOutputMedia,
  hydrateOutputMedia,
  outputMediaRowId,
  storageReferenceForUrl,
  type OutputMediaDraft,
} from "@/lib/consolidated-records"
import {
  deleteDomainRecord,
  deleteOutputMediaForOutputs,
  getDomainRecord,
  listDomainRecords,
  listOutputMedia,
  putDomainRecords,
  replaceDomainScope,
  type JsonPathFilter,
} from "@/lib/railway/domain-record-store"
import { systemOwnerId } from "@/lib/system-owner-context"

export type JsonArrayStoreInput<T> = {
  rootDir: string
  fileName: string
  key: string
  normalize?: (record: T) => T | null
  queries?: JsonPathFilter[]
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

type StoredMedia = OutputMediaDraft & { outputId?: string }

export async function readJsonArrayStore<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  const route = requireRouteFor(input)
  const ownerIds = await ownersForRead(route)
  const records = await listDomainRecords({
    table: route.table,
    sourceKey: consolidated(route) ? route.sourceKey : null,
    ownerIds,
    payloadFilters: input.queries,
    limit: input.limit,
    order: input.order,
  })
  const media =
    route.table === "outputs"
    ? (await listOutputMedia(
        records.map((record) => record.rowId)
      )) as StoredMedia[]
      : []
  return records.flatMap((record) =>
    parseRecord(record.rowId, record.payload, route, input.normalize, media)
  )
}

export async function countJsonArrayStore<T>(
  input: JsonArrayStoreInput<T>
): Promise<number> {
  const route = requireRouteFor(input)
  const ownerIds = await ownersForRead(route)
  const records = await listDomainRecords({
    table: route.table,
    sourceKey: consolidated(route) ? route.sourceKey : null,
    ownerIds,
    payloadFilters: input.queries,
    limit: MAX_COUNT_SCAN,
  })
  return records.length
}

const MAX_COUNT_SCAN = 10_000

export async function readJsonArrayRecord<T>(
  input: JsonArrayStoreInput<T> & { id: string }
): Promise<T | null> {
  const route = requireRouteFor(input)
  const ownerIds = await ownersForRead(route)
  for (const ownerId of ownerIds ?? [null]) {
    const rowId = storeRowId(route, ownerId, input.id, 0)
    const record = await getDomainRecord(route.table, rowId)
    if (!record) continue
    const media =
      route.table === "outputs"
        ? (await listOutputMedia([record.rowId])) as StoredMedia[]
        : []
    const parsed = parseRecord(
      record.rowId,
      record.payload,
      route,
      input.normalize,
      media
    )
    if (parsed) return parsed[0] ?? null
  }
  return null
}

export async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}): Promise<void> {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  await replaceDomainScope({
    table: route.table,
    sourceKey: consolidated(route) ? route.sourceKey : null,
    ownerId,
    records: desiredRecords(route, input.records, ownerId),
  })
}

export async function upsertJsonArrayRecord<T>(
  input: JsonRecordStoreInput<T>
): Promise<void> {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  const rid = pickField(input.record, ID_KEYS)
  if (!rid) throw new Error(`A record id is required to upsert into ${route.table}.`)
  const rowId = storeRowId(route, ownerId, rid, 0)
  const existing = await getDomainRecord(route.table, rowId)
  const ord =
    existing?.ord ??
    (input.position === "last" ? Date.now() : -Date.now())
  const [record] = desiredRecords(route, [input.record], ownerId, ord, 0)
  await putDomainRecords([record])
}

export async function appendJsonArrayRecords<T>(
  input: JsonArrayStoreInput<T> & { records: T[] }
): Promise<void> {
  if (!input.records.length) return
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  const now = Date.now()
  const records: Parameters<typeof putDomainRecords>[0] = []
  for (const [index, value] of input.records.entries()) {
    const rid = pickField(value, ID_KEYS)
    if (!rid) throw new Error(`A record id is required to append into ${route.table}.`)
    const rowId = storeRowId(route, ownerId, rid, 0)
    if (await getDomainRecord(route.table, rowId)) continue
    records.push(
      ...desiredRecords(route, [value], ownerId, -now - index, index)
    )
  }
  await putDomainRecords(records)
}

export async function deleteJsonArrayRecord(input: {
  rootDir: string
  fileName: string
  key: string
  id: string
}): Promise<boolean> {
  const route = requireRouteFor(input)
  const ownerId = await ownerForRoute(route)
  const rowId = storeRowId(route, ownerId, input.id, 0)
  const deleted = await deleteDomainRecord(route.table, rowId)
  if (deleted && route.table === "outputs") {
    await deleteOutputMediaForOutputs([rowId])
  }
  return deleted
}

export async function withJsonArrayStore<T, R = void>(
  input: JsonArrayStoreInput<T> & {
    update: (
      records: T[]
    ) => JsonArrayStoreUpdate<T, R> | Promise<JsonArrayStoreUpdate<T, R>>
  }
): Promise<R> {
  const records = await readJsonArrayStore({ ...input, order: "asc" })
  const next = await input.update(records)
  await writeJsonArrayStore({ ...input, records: next.records })
  return next.result as R
}

function requireRouteFor(input: {
  rootDir: string
  fileName: string
}): StoreRoute {
  const route = routeForStore(input.rootDir, input.fileName)
  if (!route) {
    throw new Error(
      `No Railway domain record is mapped for store "${input.fileName}".`
    )
  }
  return route
}

function consolidated(route: StoreRoute): boolean {
  return route.table === "outputs" || route.table === "permanent_assets"
}

function storeRowNamespace(route: StoreRoute): string {
  return consolidated(route)
    ? `${route.table}:${route.sourceKey}`
    : route.table
}

function storeRowId(
  route: StoreRoute,
  ownerId: string | null,
  rid: string | null,
  index: number
) {
  const namespace = storeRowNamespace(route)
  return ownerId
    ? ownedRowIdFor(namespace, ownerId, rid, index)
    : rowIdFor(namespace, rid, index)
}

function desiredRecords<T>(
  route: StoreRoute,
  values: T[],
  ownerId: string | null,
  forcedOrd?: number,
  firstIndex = 0
) {
  return values.map((value, indexOffset) => {
    const index = firstIndex + indexOffset
    const rid = pickField(value, ID_KEYS)
    const stableRid = rid ?? pickField(value, NAME_KEYS) ?? `idx-${index}`
    const ownedValue = ownerId ? attachOwner(value, ownerId) : value
    const extracted =
      route.table === "outputs"
        ? extractOutputMedia(route.sourceKey, ownedValue)
        : { storedData: ownedValue, media: [] as OutputMediaDraft[] }
    return {
      table: route.table,
      rowId: storeRowId(route, ownerId, stableRid, index),
      ownerId,
      sourceKey: consolidated(route) ? route.sourceKey : null,
      rid: rid ? rid.slice(0, 1024) : null,
      name: pickField(value, NAME_KEYS)?.slice(0, 2048) ?? null,
      status: pickField(value, STATUS_KEYS)?.slice(0, 255) ?? null,
      ord: forcedOrd ?? index,
      payload: extracted.storedData,
      sourceRow: {},
      media: extracted.media.map((item) => ({
        ...item,
        id: outputMediaRowId(storeRowId(route, ownerId, stableRid, index), item),
        ...storageReferenceForUrl(item.url),
      })),
    }
  })
}

async function ownersForRead(route: StoreRoute): Promise<string[] | null> {
  if (route.public) return null
  const workerOwner = systemOwnerId()
  if (workerOwner) return [workerOwner]
  const user = await getCurrentUser()
  if (!user) throw new Error(`Authentication is required to access ${route.table}.`)
  if (!route.shareable) return [user.$id]
  return [user.$id, ...(await sharedOwnerIdsFor(user))]
}

async function ownerForRoute(route: StoreRoute): Promise<string | null> {
  if (route.public) return null
  const workerOwner = systemOwnerId()
  if (workerOwner) return workerOwner
  try {
    const user = await getCurrentUser()
    if (user) return user.$id
  } catch {
    // Maintenance scripts can still specify the system owner explicitly.
  }
  const configured = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (configured) return configured
  throw new Error(`Authentication is required to access ${route.table}.`)
}

function parseRecord<T>(
  rowId: string,
  payload: unknown,
  route: StoreRoute,
  normalize: ((record: T) => T | null) | undefined,
  media: StoredMedia[]
): T[] {
  let value = payload
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  const hydratedMedia = media
    .map((item) => ({ ...item, outputId: item.outputId || rowId }))
    .filter((item) => item.outputId === rowId)
  const decoded =
    route.table === "outputs"
      ? hydrateOutputMedia(route.sourceKey, value, hydratedMedia)
      : value
  if (!decoded) return []
  const normalized = normalize
    ? normalize(decoded as T)
    : (decoded as T)
  return normalized ? [normalized] : []
}

function attachOwner<T>(record: T, ownerId: string): T {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record
  }
  return { ...(record as Record<string, unknown>), ownerId } as T
}

import { sharedOwnerIdsFor } from "@/lib/workspace-members"
