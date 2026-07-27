/**
 * Removes schema left behind by the pre-consolidation data model.
 *
 * Dry-run is the default. Pass --apply after reviewing the targets. Legacy
 * tables are deleted only when Appwrite confirms that they contain zero rows.
 *
 * Examples:
 *   node scripts/prune-appwrite-schema.mjs --env=.env
 *   node scripts/prune-appwrite-schema.mjs --env=.env --apply
 *   node scripts/prune-appwrite-schema.mjs --env=.env.local --apply
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { Client, Query, TablesDB } from "node-appwrite"

const apply = process.argv.includes("--apply")
const envPath = path.resolve(
  process.cwd(),
  argumentValue("--env") || ".env"
)
const environment = parseEnv(readFileSync(envPath, "utf8"))
const databaseId = environment.APPWRITE_DATABASE_ID || "cfarm"
const required = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
]
for (const key of required) {
  if (!environment[key]) throw new Error(`${key} is missing from ${envPath}`)
}

const tables = new TablesDB(
  new Client()
    .setEndpoint(environment.APPWRITE_ENDPOINT)
    .setProject(environment.APPWRITE_PROJECT_ID)
    .setKey(environment.APPWRITE_API_KEY)
)

const columnsToDelete = {
  output_media: [
    "permanent_asset_id",
    "mime_type",
    "bytes",
    "width",
    "height",
    "duration_ms",
    "checksum",
    "data",
  ],
  permanent_assets: [
    "parent_id",
    "tags",
    "bytes",
    "width",
    "height",
    "duration_ms",
    "checksum",
    "position",
  ],
  automations: ["created_raw", "source_key"],
  automation_runs: ["source_key"],
  usage_ledger: ["name", "status", "source_key"],
  jobs: ["priority_raw"],
  postfast_metric_snapshots: ["name", "status"],
  account_follower_snapshots: ["name", "status"],
}

const emptyLegacyTables = [
  "image_collections",
  "characters",
  "character_generations",
  "assets",
  "automation_templates",
  "automation_template_runs",
  "results",
  "slideshows",
  "word_collections",
  "product_collections",
  "postfast_posts",
  "generated_video_exports",
  "realfarm",
  "seeds",
  "automation_templates_raw",
  "character_video_generations",
  "media_library",
]

console.log(
  `${apply ? "APPLY" : "DRY RUN"} ${environment.APPWRITE_ENDPOINT} project=${environment.APPWRITE_PROJECT_ID} database=${databaseId}`
)

for (const [tableId, requestedColumns] of Object.entries(columnsToDelete)) {
  const table = await optionalTable(tableId)
  if (!table) {
    console.log(`skip missing table ${tableId}`)
    continue
  }
  const columns = await listColumns(tableId)
  const existingKeys = new Set(columns.map((column) => column.key))
  const targets = requestedColumns.filter((key) => existingKeys.has(key))
  if (targets.length === 0) {
    console.log(`skip ${tableId}: target columns already absent`)
    continue
  }

  const indexes = await listIndexes(tableId)
  const dependentIndexes = indexes.filter((index) =>
    indexColumns(index).some((key) => targets.includes(key))
  )
  for (const index of dependentIndexes) {
    console.log(`${apply ? "delete" : "would delete"} index ${tableId}.${index.key}`)
    if (apply) {
      await tables.deleteIndex({
        databaseId,
        tableId,
        key: index.key,
      })
      await waitUntilMissing(() =>
        tables.getIndex({ databaseId, tableId, key: index.key })
      )
    }
  }

  for (const key of targets) {
    console.log(`${apply ? "delete" : "would delete"} column ${tableId}.${key}`)
    if (apply) {
      await tables.deleteColumn({ databaseId, tableId, key })
      await waitUntilMissing(() =>
        tables.getColumn({ databaseId, tableId, key })
      )
    }
  }
}

for (const tableId of emptyLegacyTables) {
  const table = await optionalTable(tableId)
  if (!table) {
    console.log(`skip missing table ${tableId}`)
    continue
  }
  const response = await tables.listRows({
    databaseId,
    tableId,
    queries: [Query.limit(1)],
  })
  if (response.total !== 0) {
    throw new Error(
      `Refusing to delete ${tableId}: it contains ${response.total} rows. Migrate or remove them explicitly first.`
    )
  }
  console.log(`${apply ? "delete" : "would delete"} empty table ${tableId}`)
  if (apply) {
    await tables.deleteTable({ databaseId, tableId })
    await waitUntilMissing(() => tables.getTable({ databaseId, tableId }))
  }
}

console.log(apply ? "Schema pruning complete." : "Dry run complete; no schema was changed.")
process.exit(0)

async function optionalTable(tableId) {
  try {
    return await tables.getTable({ databaseId, tableId })
  } catch (error) {
    if (Number(error?.code) === 404) return null
    throw error
  }
}

async function listColumns(tableId) {
  const response = await tables.listColumns({
    databaseId,
    tableId,
    queries: [Query.limit(100)],
  })
  return response.columns
}

async function listIndexes(tableId) {
  const response = await tables.listIndexes({
    databaseId,
    tableId,
    queries: [Query.limit(100)],
  })
  return response.indexes
}

function indexColumns(index) {
  const value = index.columns ?? index.attributes
  return Array.isArray(value) ? value.map(String) : []
}

async function waitUntilMissing(getter) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await getter()
    } catch (error) {
      if (Number(error?.code) === 404) return
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("Timed out waiting for an Appwrite schema deletion.")
}

function argumentValue(name) {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ""
}
