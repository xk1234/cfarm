/** Idempotently provision benchmark tables and image storage. */
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

async function createStoreTable(id, name, owned) {
  await tables.createTable(DB, id, name).catch(ignoreConflict)
  for (const [key, size] of [
    ["rid", 1024],
    ["name", 2048],
    ["status", 255],
    ["created_raw", 64],
  ]) {
    await tables.createStringColumn(DB, id, key, size, false).catch(ignoreConflict)
  }
  if (owned) {
    await tables.createStringColumn(DB, id, "owner_id", 36, false).catch(ignoreConflict)
  }
  await tables.createStringColumn(DB, id, "data", 1_000_000, false).catch(ignoreConflict)
  await tables.createIntegerColumn(DB, id, "ord", false).catch(ignoreConflict)

  for (;;) {
    const columns = await tables.listColumns(DB, id)
    if (columns.columns.every((column) => column.status === "available")) break
    await sleep(700)
  }
  await tables.createIndex(DB, id, "idx_ord", "key", ["ord"], ["ASC"]).catch(ignoreConflict)
  if (owned) {
    await tables.createIndex(DB, id, "idx_owner", "key", ["owner_id"], ["ASC"]).catch(ignoreConflict)
  }
}

await createStoreTable("benchmark_corpus", "Benchmark corpus", false)
await createStoreTable("slideshow_benchmarks", "Slideshow benchmarks", true)
await storage
  .createBucket({
    bucketId: "benchmark_images",
    name: "Benchmark images",
    permissions: [],
    fileSecurity: false,
    enabled: true,
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ["webp", "jpg", "jpeg", "png"],
    encryption: true,
    antivirus: true,
  })
  .catch(ignoreConflict)

console.log(`ready: ${DB}/benchmark_corpus, ${DB}/slideshow_benchmarks, benchmark_images`)
