import { Client, Storage, TablesDB } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ignoreConflict = (error) => {
  if (error?.code !== 409) throw error
}

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)
const storage = new Storage(client)

await tables.createTable(DB, "product_collections", "Product collections").catch(ignoreConflict)
for (const [key, size] of [
  ["rid", 1024],
  ["name", 2048],
  ["status", 255],
  ["created_raw", 64],
  ["owner_id", 36],
]) {
  await tables.createStringColumn(DB, "product_collections", key, size, false).catch(ignoreConflict)
}
await tables.createStringColumn(DB, "product_collections", "data", 1_000_000, false).catch(ignoreConflict)
await tables.createIntegerColumn(DB, "product_collections", "ord", false).catch(ignoreConflict)
for (;;) {
  const columns = await tables.listColumns(DB, "product_collections")
  if (columns.columns.every((column) => column.status === "available")) break
  await sleep(700)
}
await tables.createIndex(DB, "product_collections", "idx_ord", "key", ["ord"], ["ASC"]).catch(ignoreConflict)
await tables.createIndex(DB, "product_collections", "idx_owner", "key", ["owner_id"], ["ASC"]).catch(ignoreConflict)

await storage.createBucket({
  bucketId: "product_images",
  name: "Product collection images",
  permissions: [],
  fileSecurity: false,
  enabled: true,
  maximumFileSize: 15 * 1024 * 1024,
  allowedFileExtensions: ["webp", "jpg", "jpeg", "png"],
  encryption: true,
  antivirus: true,
}).catch(ignoreConflict)

console.log(`ready: ${DB}/product_collections, product_images`)
