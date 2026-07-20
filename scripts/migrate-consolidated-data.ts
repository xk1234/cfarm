/**
 * Copy records from legacy Appwrite tables into the consolidated stores.
 *
 * This is additive: source rows and Storage files are never deleted, and a
 * destination row is only replaced when this same migration created it. Run
 * without --apply for a read-only count preview.
 *
 * Usage:
 *   pnpm appwrite:migrate-consolidated -- --env-file=.env
 *   pnpm appwrite:migrate-consolidated -- --env-file=.env --apply
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { Client, Query, TablesDB } from "node-appwrite"

import {
  canonicalRowFields,
  extractOutputMedia,
  outputMediaRowFields,
  outputMediaRowId,
} from "../lib/consolidated-records"
import {
  ID_KEYS,
  ownedRowIdFor,
  pickField,
  rowIdFor,
  type StoreRoute,
} from "../lib/appwrite-stores"

type MigrationSource = {
  sourceTable: string
  route: StoreRoute
  fallbackPrefix: string
}

const root = path.resolve(import.meta.dirname, "..")
const envFile = argumentValue("--env-file")
if (!envFile) {
  throw new Error("Pass an explicit environment file with --env-file=<path>.")
}

const env = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))
const apply = process.argv.includes("--apply")
const databaseId = env.APPWRITE_DATABASE_ID || "cfarm"
const endpoint = clean(env.APPWRITE_ENDPOINT)
const projectId = clean(env.APPWRITE_PROJECT_ID)
const apiKey = clean(env.APPWRITE_API_KEY)
const required = [
  ["APPWRITE_ENDPOINT", endpoint],
  ["APPWRITE_PROJECT_ID", projectId],
  ["APPWRITE_API_KEY", apiKey],
].filter(([, value]) => !value)
if (required.length > 0) {
  throw new Error(
    `${envFile} is missing ${required.map(([key]) => key).join(", ")}.`
  )
}

const tables = new TablesDB(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
)

const sources: MigrationSource[] = [
  permanent("image_collections", "image_collection", false),
  permanent("word_collections", "word_collection", false),
  permanent("product_collections", "product_collection", false),
  permanent("media_library", "media_library_asset", true),
  permanent("assets", "uploaded_asset", false),
  permanent("automation_templates", "automation_template", true),
  permanent("automation_template_runs", "automation_template_example", true),
  output("results", "result"),
  output("generated_video_exports", "generated_video"),
  output("x_automation_runs", "x_automation_run"),
]

console.log(
  `${apply ? "Applying" : "Previewing"} consolidated-data migration for ${endpoint} (${projectId})`
)

let totalSourceRows = 0
let totalWritten = 0
let totalSkipped = 0
let totalMedia = 0

for (const source of sources) {
  const rows = await listAllRows(source.sourceTable)
  totalSourceRows += rows.length
  console.log(
    `${source.sourceTable} -> ${source.route.table}/${source.route.sourceKey}: ${rows.length}`
  )
  if (!apply) continue

  for (const [index, row] of rows.entries()) {
    const record = parseRecord(row)
    const rid =
      clean(row.rid) ||
      clean(pickField(record, ID_KEYS)) ||
      `${source.fallbackPrefix}-${index}`
    const ownerId = source.route.public
      ? null
      : clean(row.owner_id) || clean(asRecord(record).ownerId)
    if (!source.route.public && !ownerId) {
      throw new Error(`${source.sourceTable}/${row.$id} has no owner.`)
    }

    const namespace = `${source.route.table}:${source.route.sourceKey}`
    const destinationId = ownerId
      ? ownedRowIdFor(namespace, ownerId, rid, index)
      : rowIdFor(namespace, rid, index)
    const migrationSource = `cloud:${source.sourceTable}`
    const existing = await getOptionalRow(source.route.table, destinationId)
    if (existing && clean(existing.migration_source) !== migrationSource) {
      totalSkipped += 1
      console.warn(
        `  skipped ${destinationId}: destination row is not owned by ${migrationSource}`
      )
      continue
    }

    const extracted =
      source.route.table === "outputs"
        ? extractOutputMedia(source.route.sourceKey, record)
        : { storedData: record, media: [] }
    await tables.upsertRow({
      databaseId,
      tableId: source.route.table,
      rowId: destinationId,
      data: {
        rid: rid.slice(0, 1024),
        ...(ownerId ? { owner_id: ownerId } : {}),
        ...canonicalRowFields(source.route, record, extracted.storedData),
        ord: Number.isFinite(Number(row.ord)) ? Number(row.ord) : index,
        migration_source: migrationSource,
      },
      permissions: [],
    })
    totalWritten += 1

    if (source.route.table === "outputs" && ownerId) {
      for (const media of extracted.media) {
        await tables.upsertRow({
          databaseId,
          tableId: "output_media",
          rowId: outputMediaRowId(destinationId, media),
          data: outputMediaRowFields(destinationId, ownerId, media),
          permissions: [],
        })
        totalMedia += 1
      }
    }
  }
}

if (apply) {
  console.log(
    `Migration complete: ${totalWritten} rows and ${totalMedia} media references written; ${totalSkipped} protected destination rows skipped.`
  )
} else {
  console.log(
    `Preview complete: ${totalSourceRows} source rows. Re-run with --apply to write them.`
  )
}

function permanent(
  sourceTable: string,
  sourceKey: string,
  isPublic: boolean
): MigrationSource {
  return {
    sourceTable,
    fallbackPrefix: sourceKey.replaceAll("_", "-"),
    route: {
      table: "permanent_assets",
      sourceKey,
      public: isPublic,
    },
  }
}

function output(sourceTable: string, sourceKey: string): MigrationSource {
  return {
    sourceTable,
    fallbackPrefix: sourceKey.replaceAll("_", "-"),
    route: {
      table: "outputs",
      sourceKey,
      public: false,
      shareable: true,
    },
  }
}

async function listAllRows(tableId: string) {
  const rows: Array<Record<string, unknown>> = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await tables.listRows({
      databaseId,
      tableId,
      queries,
      total: false,
    })
    rows.push(...(page.rows as Array<Record<string, unknown>>))
    if (page.rows.length < 100) return rows
    cursor = page.rows.at(-1)?.$id || ""
  }
}

async function getOptionalRow(tableId: string, rowId: string) {
  try {
    return (await tables.getRow({
      databaseId,
      tableId,
      rowId,
    })) as Record<string, unknown>
  } catch (error) {
    if (Number(asRecord(error).code) === 404) return null
    throw error
  }
}

function parseRecord(row: Record<string, unknown>) {
  try {
    const record = JSON.parse(String(row.data || "null"))
    if (record && typeof record === "object" && !Array.isArray(record)) {
      return record as Record<string, unknown>
    }
  } catch {
    // Replaced by the actionable error below.
  }
  throw new Error(`Legacy row ${row.$id} has invalid JSON data.`)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function argumentValue(name: string): string {
  const direct = process.argv.find((argument) =>
    argument.startsWith(`${name}=`)
  )
  if (direct) return direct.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || "" : ""
}
