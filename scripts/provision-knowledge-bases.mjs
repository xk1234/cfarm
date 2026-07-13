/** Idempotently provision the knowledge-base record table and upload bucket. */
import { Client, Storage, TablesDB } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "knowledge_bases"
const BUCKET = "knowledge_base_files"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ignoreConflict = (error) => { if (error?.code !== 409) throw error }

async function main() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
  const tables = new TablesDB(client)
  const storage = new Storage(client)

  await tables.createTable(DB, TABLE, "Knowledge bases").catch(ignoreConflict)
  for (const [key, size] of [["rid", 1024], ["name", 2048], ["status", 255], ["created_raw", 64], ["source_key", 255]]) {
    await tables.createStringColumn(DB, TABLE, key, size, false).catch(ignoreConflict)
  }
  await tables.createStringColumn(DB, TABLE, "data", 1_000_000, false).catch(ignoreConflict)
  await tables.createIntegerColumn(DB, TABLE, "ord", false).catch(ignoreConflict)
  for (;;) {
    const columns = await tables.listColumns(DB, TABLE)
    if (columns.columns.every((column) => column.status === "available")) break
    await sleep(700)
  }
  await tables.createIndex(DB, TABLE, "idx_ord", "key", ["ord"], ["ASC"]).catch(ignoreConflict)
  await storage.createBucket(BUCKET, "Knowledge base files", [], false, true, 100 * 1024 * 1024, ["pdf", "mp3", "wav"], "none", true, true).catch(ignoreConflict)
  console.log(`ready: ${DB}/${TABLE} and ${BUCKET}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
