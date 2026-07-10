import { randomUUID } from "node:crypto"
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import {
  CREATED_KEYS,
  ID_KEYS,
  NAME_KEYS,
  STATUS_KEYS,
  pickField,
  rowIdFor,
  tableForStore,
} from "@/lib/appwrite-stores"

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
// Public API (unchanged signatures). Mapped stores use Appwrite TablesDB;
// everything else falls back to the original filesystem implementation.
// ---------------------------------------------------------------------------

export async function readJsonArrayStore<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  return readJsonArrayStoreUnlocked(input)
}

export async function writeJsonArrayStore<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  const table = appwriteTableFor(input)
  const lockKey = table ? `aw:${table}` : storeFilePath(input)
  await withStoreFileLock(lockKey, async () => {
    await writeJsonArrayStoreUnlocked(input)
  })
}

export async function withJsonArrayStore<T, R = void>(
  input: JsonArrayStoreInput<T> & {
    update: (
      records: T[]
    ) => JsonArrayStoreUpdate<T, R> | Promise<JsonArrayStoreUpdate<T, R>>
  }
): Promise<R> {
  const table = appwriteTableFor(input)
  const lockKey = table ? `aw:${table}` : storeFilePath(input)
  return withStoreFileLock(lockKey, async () => {
    const records = await readJsonArrayStoreUnlocked(input)
    const next = await input.update(records)
    await writeJsonArrayStoreUnlocked({ ...input, records: next.records })
    return next.result as R
  })
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function appwriteTableFor(input: { rootDir: string; fileName: string }): string | null {
  if (!getAppwrite()) return null
  return tableForStore(input.rootDir, input.fileName)
}

async function readJsonArrayStoreUnlocked<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  const table = appwriteTableFor(input)
  if (table) return awReadTable<T>(table, input.normalize)
  return fsReadJsonArrayStoreUnlocked(input)
}

async function writeJsonArrayStoreUnlocked<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  const table = appwriteTableFor(input)
  if (table) return awWriteTable(table, input.records)
  return fsWriteJsonArrayStoreUnlocked(input)
}

// ---------------------------------------------------------------------------
// Appwrite TablesDB implementation
// ---------------------------------------------------------------------------

const PAGE = 100

async function awReadTable<T>(
  table: string,
  normalize?: (record: T) => T | null
): Promise<T[]> {
  const aw = getAppwrite()
  if (!aw) return []
  const out: T[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(PAGE), Query.orderAsc("ord")]
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

async function awWriteTable<T>(table: string, records: T[]): Promise<void> {
  const aw = getAppwrite()
  if (!aw) return

  const desired = records.map((rec, index) => {
    const rid = pickField(rec, ID_KEYS)
    return {
      id: rowIdFor(table, rid, index),
      payload: {
        rid: (rid ?? `idx-${index}`).slice(0, 1024),
        name: pickField(rec, NAME_KEYS)?.slice(0, 2048) ?? null,
        status: pickField(rec, STATUS_KEYS)?.slice(0, 255) ?? null,
        created_raw: pickField(rec, CREATED_KEYS)?.slice(0, 64) ?? null,
        ord: index,
        data: JSON.stringify(rec),
      },
    }
  })
  const desiredIds = new Set(desired.map((d) => d.id))

  // Existing row ids (for deletion of removed records).
  const existingIds: string[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, table, queries)
    const rows = res.rows as Array<Record<string, unknown>>
    for (const row of rows) existingIds.push(String(row.$id))
    if (rows.length < PAGE) break
    cursor = String(rows[rows.length - 1].$id)
  }

  // Upsert desired rows (bounded concurrency).
  await runPool(desired, 8, async (d) => {
    await aw.tables.upsertRow(APPWRITE_DATABASE_ID, table, d.id, d.payload)
  })

  // Delete rows no longer present.
  const toDelete = existingIds.filter((id) => !desiredIds.has(id))
  await runPool(toDelete, 8, async (id) => {
    await aw.tables.deleteRow(APPWRITE_DATABASE_ID, table, id)
  })
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
// Filesystem implementation (fallback for unmapped stores + local dev)
// ---------------------------------------------------------------------------

async function fsReadJsonArrayStoreUnlocked<T>(
  input: JsonArrayStoreInput<T>
): Promise<T[]> {
  const filePath = storeFilePath(input)
  let contents: string
  try {
    contents = await readFile(filePath, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return []
    }
    throw error
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(contents) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse JSON store at ${filePath}: ${message}`)
  }

  const records = parsed[input.key]
  if (!Array.isArray(records)) {
    return []
  }
  return input.normalize
    ? records
        .map((record) => input.normalize!(record as T))
        .flatMap((record) => (record ? [record] : []))
    : (records as T[])
}

async function fsWriteJsonArrayStoreUnlocked<T>(input: {
  rootDir: string
  fileName: string
  key: string
  records: T[]
}) {
  await mkdir(input.rootDir, { recursive: true })
  const filePath = storeFilePath(input)
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const backupPath = `${filePath}.bak`
  try {
    await writeFile(
      tempPath,
      `${JSON.stringify({ [input.key]: input.records }, null, 2)}\n`
    )
    await copyFile(filePath, backupPath).catch(() => undefined)
    await rename(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function storeFilePath(input: { rootDir: string; fileName: string }) {
  return path.resolve(input.rootDir, input.fileName)
}

async function withStoreFileLock<T>(
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
