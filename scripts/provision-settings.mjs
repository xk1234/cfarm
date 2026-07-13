import { Client, Storage, TablesDB } from "node-appwrite"

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const db = process.env.APPWRITE_DATABASE_ID || "cfarm"
const tables = new TablesDB(client)
const storage = new Storage(client)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const conflict = (error) => {
  if (error?.code !== 409) throw error
}

async function table(id) {
  await tables.createTable(db, id, id).catch(conflict)
}
async function string(tableId, key, size, required = false) {
  await tables
    .createStringColumn(db, tableId, key, size, required)
    .catch(conflict)
}
async function wait(tableId, keys) {
  for (;;) {
    const list = await tables.listColumns(db, tableId)
    if (
      keys.every((key) =>
        list.columns.some((c) => c.key === key && c.status === "available")
      )
    )
      return
    await sleep(500)
  }
}

await table("workspace_members")
for (const [key, size, required] of [
  ["owner_id", 36, true],
  ["owner_name", 128, true],
  ["email", 320, true],
  ["member_user_id", 36, false],
  ["status", 32, true],
  ["team_id", 36, true],
  ["membership_id", 36, true],
  ["created_at", 64, true],
])
  await string("workspace_members", key, size, required)
await wait("workspace_members", [
  "owner_id",
  "member_user_id",
  "status",
  "team_id",
  "membership_id",
  "created_at",
])
await tables
  .createIndex(db, "workspace_members", "idx_workspace_owner", "key", [
    "owner_id",
  ])
  .catch(conflict)
await tables
  .createIndex(db, "workspace_members", "idx_workspace_member", "key", [
    "member_user_id",
  ])
  .catch(conflict)
await tables
  .createIndex(db, "workspace_members", "idx_workspace_access", "key", [
    "member_user_id",
    "status",
  ])
  .catch(conflict)
await tables
  .createIndex(db, "workspace_members", "idx_workspace_team", "key", [
    "team_id",
    "membership_id",
  ])
  .catch(conflict)

await table("demos")
for (const [key, size, required] of [
  ["owner_id", 36, true],
  ["title", 160, true],
  ["file_id", 36, true],
  ["content_type", 128, true],
  ["created_at", 64, true],
])
  await string("demos", key, size, required)
await wait("demos", ["owner_id", "created_at"])
await tables
  .createIndex(db, "demos", "idx_demo_owner", "key", ["owner_id"])
  .catch(conflict)
await storage
  .createBucket({
    bucketId: "demos",
    name: "Demos",
    permissions: [],
    fileSecurity: false,
    enabled: true,
    maximumFileSize: 250 * 1024 * 1024,
    allowedFileExtensions: ["mp4", "mov", "webm", "m4v"],
    encryption: true,
    antivirus: true,
  })
  .catch(conflict)
console.log("settings schema ready")
