import { Client, TablesDB } from "node-appwrite"

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)
const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

for (const [id, name] of [
  ["postfast_metric_snapshots", "PostFast metric snapshots"],
  ["account_follower_snapshots", "Account follower snapshots"],
]) {
  await tables.createTable(DB, id, name).catch(ignoreConflict)
  for (const [key, size] of [
    ["rid", 1024],
    ["name", 2048],
    ["status", 255],
    ["created_raw", 64],
    ["owner_id", 36],
  ]) {
    await tables
      .createStringColumn(DB, id, key, size, false)
      .catch(ignoreConflict)
  }
  await tables.createIntegerColumn(DB, id, "ord", false).catch(ignoreConflict)
  await tables
    .createStringColumn(DB, id, "data", 1_000_000, true)
    .catch(ignoreConflict)
  for (;;) {
    const columns = await tables.listColumns(DB, id)
    if (columns.columns.every((column) => column.status === "available")) break
    await sleep(500)
  }
  await tables
    .createIndex(DB, id, "owner_idx", "key", ["owner_id"])
    .catch(ignoreConflict)
}

console.log("analytics snapshot tables ready")

function ignoreConflict(error) {
  if (error?.code === 409) return
  throw error
}
