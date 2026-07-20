/**
 * Explicit opt-in command for copying user-owned automation definitions from
 * cloud Appwrite into local Appwrite. Local setup and `pnpm dev` must never
 * call this automatically: a missing local row may be an intentional deletion.
 *
 * Owners are mapped by email. Existing local automation ids are preserved so
 * an explicitly requested cloud sync cannot overwrite a newer local edit.
 */
import crypto from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { Client, Query, TablesDB, Users } from "node-appwrite"

const root = path.resolve(import.meta.dirname, "..")
const cloudEnv = readEnvironment(path.join(root, ".env"))
const localEnv = readEnvironment(path.join(root, ".env.local"))
const sourceDatabaseId = cloudEnv.APPWRITE_DATABASE_ID || "cfarm"
const targetDatabaseId = localEnv.APPWRITE_DATABASE_ID || "cfarm"
const tableId = "automations"

requireEnvironment(cloudEnv, ".env")
requireEnvironment(localEnv, ".env.local")

if (
  cloudEnv.APPWRITE_ENDPOINT === localEnv.APPWRITE_ENDPOINT &&
  cloudEnv.APPWRITE_PROJECT_ID === localEnv.APPWRITE_PROJECT_ID
) {
  throw new Error(
    "Cloud and local Appwrite targets must be different projects."
  )
}

const cloud = services(cloudEnv)
const local = services(localEnv)
const [cloudUsers, localUsers, sourceRows, targetRows] = await Promise.all([
  listAllUsers(cloud.users),
  listAllUsers(local.users),
  listAllRows(cloud.tables, sourceDatabaseId, tableId),
  listAllRows(local.tables, targetDatabaseId, tableId),
])

const cloudUsersById = new Map(cloudUsers.map((user) => [user.$id, user]))
const localUsersByEmail = new Map(
  localUsers.map((user) => [normalizeEmail(user.email), user])
)
const existing = new Set(
  targetRows.map((row) => `${clean(row.owner_id)}:${clean(row.rid)}`)
)

let imported = 0
let skipped = 0
for (const [index, row] of sourceRows.entries()) {
  const record = parseRecord(row)
  const cloudOwner = cloudUsersById.get(clean(row.owner_id))
  const localOwner = cloudOwner
    ? localUsersByEmail.get(normalizeEmail(cloudOwner.email))
    : null
  if (!cloudOwner || !localOwner) {
    throw new Error(
      `Cannot map automation owner ${clean(row.owner_id) || "(missing)"} to a local account. Sign into the local app with the same email first.`
    )
  }

  const rid = clean(row.rid) || clean(record.id)
  if (!rid) {
    throw new Error(`Automation row ${row.$id} has no domain id.`)
  }
  const existingKey = `${localOwner.$id}:${rid}`
  if (existing.has(existingKey)) {
    skipped += 1
    continue
  }

  const localRecord = { ...record, ownerId: localOwner.$id }
  await local.tables.upsertRow({
    databaseId: targetDatabaseId,
    tableId,
    rowId: ownedRowId(tableId, localOwner.$id, rid),
    data: {
      rid: rid.slice(0, 1024),
      owner_id: localOwner.$id,
      name: clean(record.name || row.name).slice(0, 2048) || null,
      status: clean(record.status || row.status).slice(0, 255) || null,
      created_raw:
        clean(record.createdAt || record.created_at || row.created_raw).slice(
          0,
          64
        ) || null,
      data: JSON.stringify(localRecord),
      ord: Number.isFinite(Number(row.ord)) ? Number(row.ord) : index,
    },
    permissions: [],
  })
  existing.add(existingKey)
  imported += 1
}

console.log(
  `Automation sync complete: ${imported} imported, ${skipped} existing local records preserved.`
)

function services(env) {
  const client = new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY)
  return { tables: new TablesDB(client), users: new Users(client) }
}

async function listAllUsers(users) {
  const records = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await users.list({ queries })
    records.push(...response.users)
    if (response.users.length < 100) return records
    cursor = response.users.at(-1).$id
  }
}

async function listAllRows(tables, databaseId, targetTableId) {
  const records = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows({
      databaseId,
      tableId: targetTableId,
      queries,
    })
    records.push(...response.rows)
    if (response.rows.length < 100) return records
    cursor = response.rows.at(-1).$id
  }
}

function parseRecord(row) {
  try {
    const record = JSON.parse(String(row.data || "null"))
    if (record && typeof record === "object" && !Array.isArray(record)) {
      return record
    }
  } catch {
    // Replaced by the actionable error below.
  }
  throw new Error(`Automation row ${row.$id} has invalid JSON data.`)
}

function ownedRowId(table, ownerId, rid) {
  return `u${crypto
    .createHash("sha256")
    .update(`${table}:${ownerId}:${rid}`)
    .digest("hex")
    .slice(0, 35)}`
}

function readEnvironment(filePath) {
  return parseEnv(readFileSync(filePath, "utf8"))
}

function requireEnvironment(env, source) {
  for (const key of [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
  ]) {
    if (!clean(env[key])) throw new Error(`${key} is missing from ${source}.`)
  }
}

function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

function clean(value) {
  return typeof value === "string" ? value.trim() : ""
}
