#!/usr/bin/env node
// Idempotent Appwrite provisioning (docs/refactor/03-appwrite-data-layer.md §8).
//
// Creates or checks the `lumenclip` database, every table/column/index and the
// private buckets declared in lib/data/appwrite/schema.mjs.
//
//   node scripts/appwrite-provision.mjs              apply (create missing, update buckets)
//   node scripts/appwrite-provision.mjs --dry-run    print the plan, change nothing
//   node scripts/appwrite-provision.mjs --check      drift gate: exit 2 on any drift
//   node scripts/appwrite-provision.mjs --prune      list undeclared tables/columns/indexes
//   node scripts/appwrite-provision.mjs --prune --yes  …and delete them
//   --env-file <path>                                load env from a file first
//
// Env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
// (+ optional APPWRITE_DATABASE_ID, APPWRITE_BUCKET_MEDIA, APPWRITE_BUCKET_RENDERS).
// The API key is never printed. Column or index definition mismatches are
// reported, never altered (Appwrite cannot change a column type in place).
import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"

import { AppwriteException, Client, Storage, TablesDB } from "node-appwrite"

import {
  BUCKET_DEFS,
  DATABASE_NAME,
  TABLE_DEFS,
  appwriteIdsFromEnv,
} from "../lib/data/appwrite/schema.mjs"

const TESTED_SERVER_VERSIONS = [/^1\.9\./, /^2\./]

const args = process.argv.slice(2)
const flags = {
  dryRun: args.includes("--dry-run"),
  check: args.includes("--check"),
  prune: args.includes("--prune"),
  yes: args.includes("--yes"),
}
const envFileIndex = args.indexOf("--env-file")
if (envFileIndex >= 0) {
  const file = args[envFileIndex + 1]
  if (!file || !existsSync(file)) fatal(`--env-file ${file ?? ""} not found`)
  loadEnvFile(file)
}
const readOnly = flags.dryRun || flags.check

const endpoint = (process.env.APPWRITE_ENDPOINT ?? "").trim().replace(/\/+$/, "")
const projectId = (process.env.APPWRITE_PROJECT_ID ?? "").trim()
const apiKey = (process.env.APPWRITE_API_KEY ?? "").trim()
const missing = [
  !endpoint && "APPWRITE_ENDPOINT",
  !projectId && "APPWRITE_PROJECT_ID",
  !apiKey && "APPWRITE_API_KEY",
].filter(Boolean)
if (missing.length) fatal(`Missing ${missing.join(", ")}`)

const { databaseId, buckets: bucketIds } = appwriteIdsFromEnv()
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)

const mode = flags.check ? "check" : flags.dryRun ? "dry-run" : "apply"
log(`Appwrite ${new URL(endpoint).host} · project ${projectId} · database ${databaseId} · mode ${mode}${flags.prune ? " + prune" : ""}`)

const drift = []
const planned = []
const report = { tables: [], buckets: [] }

await checkVersion()
await ensureDatabase()
for (const def of TABLE_DEFS) await ensureTable(def)
if (flags.prune) await pruneTables()
for (const def of BUCKET_DEFS) await ensureBucket({ ...def, id: bucketIds[def.id] ?? def.id })

log("")
log(`Tables: ${report.tables.join(", ")}`)
log(`Buckets: ${report.buckets.join(", ")}`)
if (planned.length) {
  log(`${readOnly ? "Planned" : "Applied"} changes: ${planned.length}`)
  for (const line of planned) log(`  - ${line}`)
} else {
  log("No changes needed.")
}
if (drift.length) {
  log(`Drift (not altered): ${drift.length}`)
  for (const line of drift) log(`  ! ${line}`)
}
if (flags.check && (drift.length || planned.length)) process.exit(2)
process.exit(0)

// ───────────────────────────── steps ─────────────────────────────

async function checkVersion() {
  try {
    const res = await fetch(`${endpoint}/health/version`)
    const body = await res.json()
    const version = String(body?.version ?? "unknown")
    const tested = TESTED_SERVER_VERSIONS.some((re) => re.test(version))
    log(`Server version ${version}${tested ? "" : " (untested with this SDK; continuing)"}`)
  } catch {
    log("Server version: unavailable (continuing)")
  }
}

async function ensureDatabase() {
  const existing = await maybe(() => tablesDB.get({ databaseId }))
  if (existing) return
  await change(`create database ${databaseId}`, () => tablesDB.create({ databaseId, name: DATABASE_NAME }))
}

async function ensureTable(def) {
  report.tables.push(def.id)
  let table = await maybe(() => tablesDB.getTable({ databaseId, tableId: def.id }))
  if (!table) {
    await change(`create table ${def.id}`, () =>
      tablesDB.createTable({ databaseId, tableId: def.id, name: def.name, permissions: [], rowSecurity: false })
    )
    if (readOnly) {
      for (const col of def.columns) planned.push(`create column ${def.id}.${col.key} (${describeColumn(col)})`)
      for (const idx of def.indexes) planned.push(`create index ${def.id}.${idx.key}`)
      return
    }
    table = await retry(() => tablesDB.getTable({ databaseId, tableId: def.id }))
  } else {
    if (table.rowSecurity) drift.push(`${def.id}: rowSecurity is on (expected off)`)
    if ((table.$permissions ?? []).length) drift.push(`${def.id}: has table permissions (expected none)`)
  }

  const actualColumns = new Map((table.columns ?? []).map((c) => [c.key, c]))
  for (const col of def.columns) {
    const actual = actualColumns.get(col.key)
    if (!actual) {
      await change(`create column ${def.id}.${col.key} (${describeColumn(col)})`, () => createColumn(def.id, col))
      continue
    }
    const mismatch = columnMismatch(col, actual)
    if (mismatch) drift.push(`${def.id}.${col.key}: ${mismatch}`)
    if (actual.status === "failed" || actual.status === "stuck") drift.push(`${def.id}.${col.key}: status ${actual.status}`)
  }
  if (!readOnly) await waitForColumns(def.id)

  const actualIndexes = new Map((table.indexes ?? []).map((i) => [i.key, i]))
  for (const idx of def.indexes) {
    const actual = actualIndexes.get(idx.key)
    if (!actual) {
      await change(`create index ${def.id}.${idx.key} [${idx.columns.join(", ")}]`, () =>
        tablesDB.createIndex({
          databaseId,
          tableId: def.id,
          key: idx.key,
          type: idx.type,
          columns: idx.columns,
          orders: idx.orders ?? idx.columns.map(() => "asc"),
        })
      )
      continue
    }
    const mismatch = indexMismatch(idx, actual)
    if (mismatch) drift.push(`${def.id} index ${idx.key}: ${mismatch}`)
  }
  if (!readOnly) await waitForIndexes(def.id)

  if (flags.prune) {
    const declaredColumns = new Set(def.columns.map((c) => c.key))
    for (const key of actualColumns.keys()) {
      if (declaredColumns.has(key)) continue
      await pruneItem(`column ${def.id}.${key}`, () => tablesDB.deleteColumn({ databaseId, tableId: def.id, key }))
    }
    const declaredIndexes = new Set(def.indexes.map((i) => i.key))
    for (const key of actualIndexes.keys()) {
      if (declaredIndexes.has(key)) continue
      await pruneItem(`index ${def.id}.${key}`, () => tablesDB.deleteIndex({ databaseId, tableId: def.id, key }))
    }
  }
}

async function pruneTables() {
  const declared = new Set(TABLE_DEFS.map((t) => t.id))
  const list = await maybe(() => tablesDB.listTables({ databaseId, total: false }))
  for (const table of list?.tables ?? []) {
    if (declared.has(table.$id)) continue
    await pruneItem(`table ${table.$id}`, () => tablesDB.deleteTable({ databaseId, tableId: table.$id }))
  }
}

async function ensureBucket(def) {
  report.buckets.push(def.id)
  const desired = {
    bucketId: def.id,
    name: def.name,
    permissions: [],
    fileSecurity: false,
    enabled: true,
    maximumFileSize: def.maximumFileSize,
    allowedFileExtensions: def.allowedFileExtensions,
    compression: def.compression,
    encryption: def.encryption,
    antivirus: def.antivirus,
    transformations: def.transformations,
  }
  const existing = await maybe(() => storage.getBucket({ bucketId: def.id }))
  if (!existing) {
    await change(`create bucket ${def.id}`, () => storage.createBucket(desired))
    return
  }
  const diffs = []
  if ((existing.$permissions ?? []).length) diffs.push("permissions")
  if (existing.fileSecurity) diffs.push("fileSecurity")
  if (!existing.enabled) diffs.push("enabled")
  if (Number(existing.maximumFileSize) !== def.maximumFileSize) diffs.push("maximumFileSize")
  if ([...(existing.allowedFileExtensions ?? [])].sort().join(",") !== [...def.allowedFileExtensions].sort().join(",")) {
    diffs.push("allowedFileExtensions")
  }
  if ((existing.compression ?? "none") !== def.compression) diffs.push("compression")
  if (Boolean(existing.encryption) !== def.encryption) diffs.push("encryption")
  if (Boolean(existing.antivirus) !== def.antivirus) diffs.push("antivirus")
  if ("transformations" in existing && Boolean(existing.transformations) !== def.transformations) diffs.push("transformations")
  if (diffs.length) await change(`update bucket ${def.id} (${diffs.join(", ")})`, () => storage.updateBucket(desired))
}

// ───────────────────────────── columns/indexes ─────────────────────────────

function describeColumn(col) {
  return [
    col.type + (col.size ? `(${col.size})` : ""),
    col.required ? "required" : "optional",
    col.array ? "array" : "",
  ]
    .filter(Boolean)
    .join(", ")
}

function normalizedActualType(actual) {
  if (actual.type === "string" && actual.format === "datetime") return "datetime"
  if (actual.type === "double") return "float"
  return actual.type
}

function columnMismatch(col, actual) {
  const problems = []
  const type = normalizedActualType(actual)
  if (type !== col.type) problems.push(`type ${type} ≠ ${col.type}`)
  if (col.type === "varchar" && col.size && Number(actual.size) !== col.size) problems.push(`size ${actual.size} ≠ ${col.size}`)
  if (Boolean(actual.required) !== Boolean(col.required)) problems.push(`required ${Boolean(actual.required)} ≠ ${Boolean(col.required)}`)
  if (Boolean(actual.array) !== Boolean(col.array)) problems.push(`array ${Boolean(actual.array)} ≠ ${Boolean(col.array)}`)
  return problems.join("; ")
}

function indexMismatch(idx, actual) {
  const problems = []
  if (actual.type !== idx.type) problems.push(`type ${actual.type} ≠ ${idx.type}`)
  if ((actual.columns ?? []).join(",") !== idx.columns.join(",")) problems.push(`columns [${actual.columns}] ≠ [${idx.columns}]`)
  const wantOrders = (idx.orders ?? idx.columns.map(() => "asc")).map((o) => o.toLowerCase())
  const haveOrders = (actual.orders ?? []).map((o) => String(o ?? "asc").toLowerCase())
  if (haveOrders.length && haveOrders.join(",") !== wantOrders.join(",")) problems.push(`orders [${haveOrders}] ≠ [${wantOrders}]`)
  if (actual.status === "failed" || actual.status === "stuck") problems.push(`status ${actual.status}${actual.error ? `: ${actual.error}` : ""}`)
  return problems.join("; ")
}

function createColumn(tableId, col) {
  const base = { databaseId, tableId, key: col.key, required: Boolean(col.required), array: Boolean(col.array) }
  switch (col.type) {
    case "varchar":
      return tablesDB.createVarcharColumn({ ...base, size: col.size })
    case "text":
      return tablesDB.createTextColumn(base)
    case "mediumtext":
      return tablesDB.createMediumtextColumn(base)
    case "longtext":
      return tablesDB.createLongtextColumn(base)
    case "integer":
      return tablesDB.createIntegerColumn(base)
    case "float":
      return tablesDB.createFloatColumn(base)
    case "boolean":
      return tablesDB.createBooleanColumn(base)
    case "datetime":
      return tablesDB.createDatetimeColumn(base)
    default:
      throw new Error(`Unsupported column type ${col.type}`)
  }
}

async function waitForColumns(tableId) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const table = await retry(() => tablesDB.getTable({ databaseId, tableId }))
    const columns = table.columns ?? []
    const bad = columns.find((c) => c.status === "failed" || c.status === "stuck")
    if (bad) throw new Error(`Column ${tableId}.${bad.key} is ${bad.status}${bad.error ? `: ${bad.error}` : ""}`)
    if (columns.every((c) => c.status === "available")) return
    await sleep(500)
  }
  throw new Error(`Columns for ${tableId} did not become available.`)
}

async function waitForIndexes(tableId) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const table = await retry(() => tablesDB.getTable({ databaseId, tableId }))
    const indexes = table.indexes ?? []
    const bad = indexes.find((i) => i.status === "failed" || i.status === "stuck")
    if (bad) throw new Error(`Index ${tableId}.${bad.key} is ${bad.status}${bad.error ? `: ${bad.error}` : ""}`)
    if (indexes.every((i) => i.status === "available")) return
    await sleep(500)
  }
  throw new Error(`Indexes for ${tableId} did not become available.`)
}

// ───────────────────────────── plumbing ─────────────────────────────

async function change(description, fn) {
  planned.push(description)
  if (readOnly) return
  try {
    await retry(fn)
    log(`✓ ${description}`)
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 409) {
      log(`= ${description} (already exists)`)
      return
    }
    throw new Error(`${description} failed: ${describeError(error)}`)
  }
}

async function pruneItem(description, fn) {
  if (!flags.yes || readOnly) {
    drift.push(`undeclared ${description}${flags.yes ? "" : " (delete with --prune --yes)"}`)
    return
  }
  planned.push(`delete ${description}`)
  await retry(fn)
  log(`✗ deleted ${description}`)
}

async function maybe(fn) {
  try {
    return await retry(fn)
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 404) return null
    throw error
  }
}

async function retry(fn, attempts = 6) {
  for (let i = 0; ; i += 1) {
    try {
      return await fn()
    } catch (error) {
      const code = error instanceof AppwriteException ? error.code : 0
      const transient = code === 429 || code >= 500 || (!code && /fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(error?.message)))
      if (!transient || i >= attempts - 1) throw error
      await sleep(Math.min(1000 * 2 ** i, 15_000))
    }
  }
}

function describeError(error) {
  if (error instanceof AppwriteException) return `${error.code} ${error.type}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(line) {
  console.log(line)
}

function fatal(message) {
  console.error(`appwrite-provision: ${message}`)
  process.exit(1)
}
