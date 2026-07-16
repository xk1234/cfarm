/**
 * Adds user ownership columns and indexes to LumenClip tables.
 *
 * Optional legacy migration:
 *   LUMENCLIP_LEGACY_OWNER_ID=<appwrite-user-id> node scripts/provision-multitenancy.mjs
 *
 * Without LUMENCLIP_LEGACY_OWNER_ID the script only provisions schema and does
 * not assign pre-authentication records to any user.
 */
import { Client, Query, TablesDB } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const LEGACY_OWNER = process.env.LUMENCLIP_LEGACY_OWNER_ID?.trim()
const TABLES = [
  "image_collections",
  "characters",
  "character_generations",
  "character_video_generations",
  "assets",
  "automations",
  "automation_runs",
  "x_automations",
  "x_automation_runs",
  "results",
  "slideshows",
  "usage_ledger",
  "word_collections",
  "postfast_posts",
  "postfast_metric_snapshots",
  "account_follower_snapshots",
  "swipes",
  "generated_video_exports",
  "knowledge_bases",
  "jobs",
  "slideshow_benchmarks",
  "product_collections",
]
const JSON_STORE_TABLES = [
  "image_collections",
  "characters",
  "character_generations",
  "character_video_generations",
  "assets",
  "automations",
  "automation_runs",
  "x_automations",
  "x_automation_runs",
  "results",
  "usage_ledger",
  "word_collections",
  "postfast_posts",
  "swipes",
  "generated_video_exports",
  "knowledge_bases",
  "slideshow_benchmarks",
  "product_collections",
  "automation_templates",
  "automation_template_runs",
  "benchmark_corpus",
  "x_benchmark_corpus",
  "media_library",
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ignoreConflict = (error) => {
  if (error?.code !== 409) throw error
}

async function main() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
  const tables = new TablesDB(client)

  for (const table of TABLES) {
    await tables
      .createStringColumn(DB, table, "owner_id", 36, false)
      .catch(ignoreConflict)
  }

  for (const table of JSON_STORE_TABLES) {
    for (const [key, column] of [
      ["idx_ord", "ord"],
      ["idx_rid", "rid"],
      ["idx_status", "status"],
    ]) {
      await tables
        .createIndex(DB, table, key, "key", [column], ["ASC"])
        .catch(ignoreConflict)
    }
  }

  for (const table of TABLES) {
    for (;;) {
      const columns = await tables.listColumns(DB, table)
      const owner = columns.columns.find((column) => column.key === "owner_id")
      if (owner?.status === "available") break
      await sleep(700)
    }
    await tables
      .createIndex(DB, table, "idx_owner", "key", ["owner_id"], ["ASC"])
      .catch(ignoreConflict)
  }

  if (LEGACY_OWNER) {
    for (const table of TABLES) {
      let cursor
      for (;;) {
        const queries = [Query.limit(100)]
        if (cursor) queries.push(Query.cursorAfter(cursor))
        const response = await tables.listRows(DB, table, queries)
        for (const row of response.rows) {
          if (row.owner_id) continue
          let data = row.data
          if (typeof data === "string") {
            try {
              const parsed = JSON.parse(data)
              data = JSON.stringify({ ...parsed, ownerId: LEGACY_OWNER })
            } catch {
              // Jobs and other direct tables may not use the JSON data column.
            }
          }
          await tables.updateRow(DB, table, row.$id, {
            owner_id: LEGACY_OWNER,
            ...(typeof row.data === "string" ? { data } : {}),
          })
        }
        if (response.rows.length < 100) break
        cursor = response.rows.at(-1)?.$id
      }
    }
  }

  console.log(
    `multitenancy ready for ${TABLES.length} tables${
      LEGACY_OWNER ? `; legacy owner=${LEGACY_OWNER}` : ""
    }`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
