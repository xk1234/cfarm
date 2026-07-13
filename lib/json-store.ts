import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import {
  CREATED_KEYS,
  ID_KEYS,
  NAME_KEYS,
  ownedRowIdFor,
  PUBLIC_STORE_TABLES,
  STATUS_KEYS,
  pickField,
  rowIdFor,
  tableForStore,
} from "@/lib/appwrite-stores"
import { getCurrentUser } from "@/lib/auth"
import { sharedOwnerIdsFor } from "@/lib/workspace-members"

type JsonArrayStoreInput<T> = {
  rootDir: string
  fileName: string
  key: string
  normalize?: (record: T) => T | null
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
  const table = requireTableFor(input)
  return awReadTable<T>(table, input.normalize, await ownersForRead(table))
}

export async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  const table = requireTableFor(input)
  const ownerId = await ownerForTable(table)
  await withStoreLock(`aw:${table}:${ownerId ?? "public"}`, async () => {
    await awWriteTable(table, input.records, ownerId)
  })
}

export async function withJsonArrayStore<T, R = void>(
  input: JsonArrayStoreInput<T> & {
    update: (
      records: T[]
    ) => JsonArrayStoreUpdate<T, R> | Promise<JsonArrayStoreUpdate<T, R>>
  }
): Promise<R> {
  const table = requireTableFor(input)
  const ownerId = await ownerForTable(table)
  return withStoreLock(`aw:${table}:${ownerId ?? "public"}`, async () => {
    const records = await awReadTable<T>(
      table,
      input.normalize,
      ownerId ? [ownerId] : null
    )
    const next = await input.update(records)
    await awWriteTable(table, next.records, ownerId)
    return next.result as R
  })
}

// ---------------------------------------------------------------------------
// Routing (Appwrite required)
// ---------------------------------------------------------------------------

function requireTableFor(input: { rootDir: string; fileName: string }): string {
  if (!getAppwrite()) {
    throw new Error(
      "Appwrite is not configured. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY — this app is Appwrite-only and has no filesystem fallback."
    )
  }
  const table = tableForStore(input.rootDir, input.fileName)
  if (!table) {
    throw new Error(
      `No Appwrite table is mapped for store "${input.fileName}". Add it to STORE_TABLES in lib/appwrite-stores.ts.`
    )
  }
  return table
}

// ---------------------------------------------------------------------------
// Appwrite TablesDB implementation
// ---------------------------------------------------------------------------

const PAGE = 100

async function awReadTable<T>(
  table: string,
  normalize: ((record: T) => T | null) | undefined,
  ownerIds: string[] | null
): Promise<T[]> {
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("Appwrite is not configured.")
  }
  const out: T[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(PAGE), Query.orderAsc("ord")]
    if (ownerIds?.length) queries.unshift(Query.equal("owner_id", ownerIds))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, table, queries)
    const rows = res.rows as Array<Record<string, unknown>>
    for (const row of rows) {
      const raw = typeof row.data === "string" ? row.data : "null"
      let parsed: T
      try {
        parsed = JSON.parse(raw) as T
      } catch {
        continue
      }
      if (parsed == null) continue
      if (normalize) {
        const normalized = normalize(parsed)
        if (normalized) out.push(normalized)
      } else {
        out.push(parsed)
      }
    }
    if (rows.length < PAGE) break
    cursor = String(rows[rows.length - 1].$id)
  }
  return out
}

const SHAREABLE_TABLES = new Set([
  "swipes",
  "character_generations",
  "character_video_generations",
  "results",
  "slideshows",
  "generated_video_exports",
  "slideshow_benchmarks",
])

async function ownersForRead(table: string): Promise<string[] | null> {
  if (PUBLIC_STORE_TABLES.has(table)) return null
  const user = await getCurrentUser()
  if (!user) throw new Error(`Authentication is required to access ${table}.`)
  if (!SHAREABLE_TABLES.has(table)) return [user.$id]
  return [user.$id, ...(await sharedOwnerIdsFor(user))]
}

async function awWriteTable<T>(
  table: string,
  records: T[],
  ownerId: string | null
): Promise<void> {
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("Appwrite is not configured.")
  }

  const desired = records.map((rec, index) => {
    const rid = pickField(rec, ID_KEYS)
    const ownedRecord = ownerId ? attachOwner(rec, ownerId) : rec
    return {
      id: ownerId
        ? ownedRowIdFor(table, ownerId, rid, index)
        : rowIdFor(table, rid, index),
      payload: {
        rid: (rid ?? `idx-${index}`).slice(0, 1024),
        name: pickField(rec, NAME_KEYS)?.slice(0, 2048) ?? null,
        status: pickField(rec, STATUS_KEYS)?.slice(0, 255) ?? null,
        created_raw: pickField(rec, CREATED_KEYS)?.slice(0, 64) ?? null,
        ord: index,
        ...(ownerId ? { owner_id: ownerId } : {}),
        data: JSON.stringify(ownedRecord),
      },
    }
  })
  const desiredIds = new Set(desired.map((d) => d.id))

  // Existing row ids (for deletion of removed records).
  const existingIds: string[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(PAGE)]
    if (ownerId) queries.unshift(Query.equal("owner_id", [ownerId]))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, table, queries)
    const rows = res.rows as Array<Record<string, unknown>>
    for (const row of rows) existingIds.push(String(row.$id))
    if (rows.length < PAGE) break
    cursor = String(rows[rows.length - 1].$id)
  }

  // Upsert desired rows (bounded concurrency).
  await runPool(desired, 3, async (d) => {
    await retryTransient(() =>
      aw.tables.upsertRow(APPWRITE_DATABASE_ID, table, d.id, d.payload)
    )
  })

  // Delete rows no longer present.
  const toDelete = existingIds.filter((id) => !desiredIds.has(id))
  await runPool(toDelete, 3, async (id) => {
    await retryTransient(() =>
      aw.tables.deleteRow(APPWRITE_DATABASE_ID, table, id)
    )
  })
}

async function ownerForTable(table: string): Promise<string | null> {
  if (PUBLIC_STORE_TABLES.has(table)) return null
  try {
    const user = await getCurrentUser()
    if (user) return user.$id
  } catch {
    // Scripts and isolated store tests do not have a Next.js request context.
  }
  const systemOwner = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (systemOwner) return systemOwner
  throw new Error(`Authentication is required to access ${table}.`)
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
