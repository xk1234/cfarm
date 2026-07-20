/**
 * Clone the live Appwrite schema from a SOURCE project to a TARGET project.
 *
 * Copies: database, tables, columns, indexes, and storage buckets.
 * Does NOT copy: rows or files (schema only — the target starts empty).
 *
 * Why this exists: the physical schema is consolidated (most logical stores
 * route into `permanent_assets` / `outputs` / `output_media`) and was built
 * incrementally. The hand-written provision-*.mjs scripts predate the
 * consolidation and only cover a subset, so they cannot rebuild a fresh
 * instance. Introspecting the live project is the authoritative source of truth.
 *
 * Env (loaded from .env / .env.local automatically):
 *   Source (read-only):  SRC_APPWRITE_ENDPOINT, SRC_APPWRITE_PROJECT_ID, SRC_APPWRITE_API_KEY
 *   Target (writes to):  APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
 *   Database id:         APPWRITE_DATABASE_ID (default "cfarm"), used for both.
 *
 * Usage:
 *   pnpm appwrite:clone-schema
 *   # or: node scripts/clone-appwrite-schema.mjs
 *
 * Idempotent: anything that already exists on the target (409) is skipped, so
 * it is safe to re-run after adding tables/columns on the source.
 */
import { Client, Databases, Query, Storage, TablesDB } from "node-appwrite"

for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file)
  } catch {
    // Missing file or already-exported env — both fine.
  }
}

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isConflict = (error) =>
  Number(error?.code) === 409 ||
  (Number(error?.code) === 400 &&
    error?.type === "column_index_invalid" &&
    /already an index with the same attributes and orders/i.test(
      String(error?.message)
    ))

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]?.trim())
  if (missing.length > 0) {
    console.error(`Missing required env: ${missing.join(", ")}`)
    process.exit(1)
  }
}

requireEnv([
  "SRC_APPWRITE_ENDPOINT",
  "SRC_APPWRITE_PROJECT_ID",
  "SRC_APPWRITE_API_KEY",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
])

if (
  process.env.SRC_APPWRITE_ENDPOINT === process.env.APPWRITE_ENDPOINT &&
  process.env.SRC_APPWRITE_PROJECT_ID === process.env.APPWRITE_PROJECT_ID
) {
  console.error(
    "Refusing to run: source and target are the same project. " +
      "Point APPWRITE_* at your LOCAL instance and SRC_APPWRITE_* at cloud."
  )
  process.exit(1)
}

const source = clientFor("SRC_APPWRITE")
const target = clientFor("APPWRITE")

function clientFor(prefix) {
  const client = new Client()
    .setEndpoint(process.env[`${prefix}_ENDPOINT`])
    .setProject(process.env[`${prefix}_PROJECT_ID`])
    .setKey(process.env[`${prefix}_API_KEY`])
  return {
    databases: new Databases(client),
    tables: new TablesDB(client),
    storage: new Storage(client),
  }
}

/** Page through any Appwrite list endpoint that returns { <field>, total }. */
async function listAll(field, fetchPage) {
  const out = []
  let cursor = null
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await fetchPage(queries)
    const rows = page[field] ?? []
    out.push(...rows)
    if (rows.length < 100) break
    cursor = rows[rows.length - 1].$id
  }
  return out
}

async function createColumn(tableId, column) {
  const key = column.key
  const required = Boolean(column.required)
  const array = Boolean(column.array)
  // Appwrite forbids a default on required or array columns.
  const def = required || array ? undefined : column.default
  switch (column.type) {
    case "longtext":
      return target.tables.createLongtextColumn(
        DB,
        tableId,
        key,
        required,
        def,
        array,
        Boolean(column.encrypt)
      )
    case "mediumtext":
      return target.tables.createMediumtextColumn(
        DB,
        tableId,
        key,
        required,
        def,
        array,
        Boolean(column.encrypt)
      )
    case "text":
      return target.tables.createTextColumn(
        DB,
        tableId,
        key,
        required,
        def,
        array,
        Boolean(column.encrypt)
      )
    case "string":
      if (column.format === "enum") {
        return target.tables.createEnumColumn(
          DB,
          tableId,
          key,
          column.elements ?? [],
          required,
          def,
          array
        )
      }
      // varchar/text/mediumtext/longtext all report type "string" with a size.
      // createStringColumn accepts large sizes (as the provision scripts do).
      return target.tables.createStringColumn(
        DB,
        tableId,
        key,
        column.size ?? 255,
        required,
        def,
        array
      )
    case "integer":
      return target.tables.createIntegerColumn(
        DB,
        tableId,
        key,
        required,
        toSafeInteger(column.min),
        toSafeInteger(column.max),
        toSafeInteger(def),
        array
      )
    case "double":
      return target.tables.createFloatColumn(
        DB,
        tableId,
        key,
        required,
        toNum(column.min),
        toNum(column.max),
        toNum(def),
        array
      )
    case "boolean":
      return target.tables.createBooleanColumn(
        DB,
        tableId,
        key,
        required,
        def,
        array
      )
    case "datetime":
      return target.tables.createDatetimeColumn(
        DB,
        tableId,
        key,
        required,
        def,
        array
      )
    default:
      console.warn(
        `  ! skipping column ${tableId}.${key}: unsupported type "${column.type}"`
      )
      return null
  }
}

function toNum(value) {
  if (value == null) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function toSafeInteger(value) {
  if (value == null) return undefined
  if (typeof value === "bigint") {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) &&
      value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : undefined
  }
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : undefined
}

async function waitForColumns(tableId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { columns } = await target.tables.listColumns(DB, tableId)
    const pending = columns.filter((c) => c.status !== "available")
    if (pending.length === 0) return
    await sleep(700)
  }
  console.warn(`  ! columns for ${tableId} still processing after wait`)
}

async function main() {
  console.log(`Cloning schema "${DB}"`)
  console.log(`  source: ${process.env.SRC_APPWRITE_ENDPOINT}`)
  console.log(`  target: ${process.env.APPWRITE_ENDPOINT}\n`)

  // 1. Database
  await target.databases
    .create(DB, DB)
    .then(() => console.log(`database ${DB}: created`))
    .catch((error) => {
      if (!isConflict(error)) throw error
      console.log(`database ${DB}: exists`)
    })

  // 2. Tables → columns → indexes
  const tables = await listAll("tables", (queries) =>
    source.tables.listTables(DB, queries)
  )
  console.log(`\n${tables.length} tables to clone`)
  for (const table of tables) {
    await target.tables
      .createTable(
        DB,
        table.$id,
        table.name ?? table.$id,
        undefined,
        Boolean(table.rowSecurity)
      )
      .catch((error) => {
        if (!isConflict(error)) throw error
      })
    console.log(`\ntable ${table.$id}`)

    const { columns } = await source.tables.listColumns(DB, table.$id)
    for (const column of columns) {
      try {
        await createColumn(table.$id, column)
        console.log(`  + ${column.key} (${column.type})`)
      } catch (error) {
        if (isConflict(error)) continue
        throw error
      }
    }
    await waitForColumns(table.$id)

    const { indexes } = await source.tables.listIndexes(DB, table.$id)
    for (const index of indexes) {
      const cols = index.columns ?? index.attributes ?? []
      try {
        await target.tables.createIndex(
          DB,
          table.$id,
          index.key,
          index.type,
          cols,
          index.orders ?? undefined,
          index.lengths ?? undefined
        )
        console.log(`  # index ${index.key} [${cols.join(", ")}]`)
      } catch (error) {
        if (isConflict(error)) continue
        throw error
      }
    }
  }

  // 3. Storage buckets (empty — files are not copied)
  const buckets = await listAll("buckets", (queries) =>
    source.storage.listBuckets(queries)
  )
  console.log(`\n${buckets.length} buckets to clone`)
  for (const bucket of buckets) {
    const maximumFileSize =
      Number(bucket.maximumFileSize) > 0
        ? Number(bucket.maximumFileSize)
        : 30_000_000
    await target.storage
      .createBucket(
        bucket.$id,
        bucket.name ?? bucket.$id,
        undefined,
        Boolean(bucket.fileSecurity),
        bucket.enabled ?? true,
        maximumFileSize,
        bucket.allowedFileExtensions ?? [],
        bucket.compression,
        bucket.encryption,
        bucket.antivirus
      )
      .then(() => console.log(`bucket ${bucket.$id}: created`))
      .catch((error) => {
        if (!isConflict(error)) throw error
        return target.storage
          .updateBucket({
            bucketId: bucket.$id,
            name: bucket.name ?? bucket.$id,
            fileSecurity: Boolean(bucket.fileSecurity),
            enabled: bucket.enabled ?? true,
            maximumFileSize,
            allowedFileExtensions: bucket.allowedFileExtensions ?? [],
            compression: bucket.compression,
            encryption: bucket.encryption,
            antivirus: bucket.antivirus,
            transformations: bucket.transformations,
          })
          .then(() => console.log(`bucket ${bucket.$id}: updated`))
      })
  }

  console.log("\nSchema clone complete.")
}

main().catch((error) => {
  console.error("\nClone failed:", error?.message ?? error)
  process.exit(1)
})
