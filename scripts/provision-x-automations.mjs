import { Client, TablesDB } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const tables = new TablesDB(
  new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
)
const definitions = [
  ["x_automations", "X automations"],
  ["x_automation_runs", "X automation runs"],
  ["x_benchmark_corpus", "X benchmark corpus"],
  ["x_benchmark_scores", "X benchmark scores"],
]
const ignoreConflict = (error) => {
  if (error?.code !== 409) throw error
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const [id, name] of definitions) {
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
    .createIndex(DB, id, "idx_owner", "key", ["owner_id"], ["ASC"])
    .catch(ignoreConflict)
  await tables
    .createIndex(DB, id, "idx_ord", "key", ["ord"], ["ASC"])
    .catch(ignoreConflict)
}

console.log("X automation tables are ready")
