/** Read-only TablesDB audit. This module deliberately exposes no write operation. */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { Client, Query, TablesDB } from "node-appwrite"

import {
  classifyAutomation,
  classifyAutomationTemplate,
  classifyImageCollection,
  classifySlideshowResult,
  classifyXAutomation,
  classifyXAutomationRun,
  type ClassificationResult,
  type ShapeClassification,
} from "./legacy-shapes/classify"

type Row = Record<string, unknown> & { $id: string }
type Store = {
  selector: string
  table: string
  sourceKey?: string
  public: boolean
  classify: (raw: unknown) => ClassificationResult
}

const stores: Store[] = [
  {
    selector: "automation_templates",
    table: "permanent_assets",
    sourceKey: "automation_template",
    public: true,
    classify: classifyAutomationTemplate,
  },
  {
    selector: "automations",
    table: "automations",
    public: false,
    classify: classifyAutomation,
  },
  {
    selector: "x_automations",
    table: "x_automations",
    public: false,
    classify: classifyXAutomation,
  },
  {
    selector: "x_automation_runs",
    table: "outputs",
    sourceKey: "x_automation_run",
    public: false,
    classify: classifyXAutomationRun,
  },
  {
    selector: "results",
    table: "outputs",
    sourceKey: "result",
    public: false,
    classify: classifySlideshowResult,
  },
  {
    selector: "image_collections",
    table: "permanent_assets",
    sourceKey: "image_collection",
    public: false,
    classify: classifyImageCollection,
  },
]

const allowedFlags = new Set([
  "--env-file",
  "--store",
  "--owner",
  "--all-owners",
  "--out",
])
for (const argument of process.argv.slice(2)) {
  if (argument === "--") continue
  if (!argument.startsWith("--")) continue
  const flag = argument.split("=", 1)[0]
  if (!allowedFlags.has(flag)) throw new Error(`Unknown flag: ${flag}`)
}

const root = path.resolve(import.meta.dirname, "..")
const envFile = argumentValue("--env-file")
const selector = argumentValue("--store")
const owner = argumentValue("--owner")
const allOwners = process.argv.includes("--all-owners")
const outFile = argumentValue("--out")
if (!envFile)
  throw new Error("Pass an explicit environment file with --env-file=<path>.")
if (!selector) throw new Error("Pass a store with --store=<selector>|all.")
if (owner && allOwners)
  throw new Error("Use either --owner=<id> or --all-owners, not both.")

const selected =
  selector === "all"
    ? stores
    : stores.filter((store) => store.selector === selector)
if (selected.length === 0)
  throw new Error(
    `Unknown store ${selector}. Expected ${stores.map((store) => store.selector).join(", ")}, or all.`
  )
if (selected.some((store) => !store.public) && !owner && !allOwners) {
  throw new Error(
    "Private stores require --owner=<id> or explicit --all-owners."
  )
}

const env = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))
const endpoint = clean(env.APPWRITE_ENDPOINT)
const projectId = clean(env.APPWRITE_PROJECT_ID)
const apiKey = clean(env.APPWRITE_API_KEY)
const databaseId = clean(env.APPWRITE_DATABASE_ID) || "cfarm"
const missing = [
  ["APPWRITE_ENDPOINT", endpoint],
  ["APPWRITE_PROJECT_ID", projectId],
  ["APPWRITE_API_KEY", apiKey],
].filter(([, value]) => !value)
if (missing.length)
  throw new Error(
    `${envFile} is missing ${missing.map(([key]) => key).join(", ")}.`
  )

// The capability held by this script is intentionally narrowed to listRows.
// No create/update/delete/upsert method is captured or reachable below.
const appwrite = new TablesDB(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
)
const listRows: TablesDB["listRows"] = appwrite.listRows.bind(appwrite)

console.log(
  JSON.stringify(
    {
      mode: "read-only",
      endpoint,
      project: projectId,
      database: databaseId,
      stores: selected.map((store) => store.selector),
      ownerScope: owner || (allOwners ? "all owners" : "public"),
    },
    null,
    2
  )
)

const summary: Record<string, unknown> = {
  mode: "read-only",
  endpoint,
  project: projectId,
  database: databaseId,
  ownerScope: owner || (allOwners ? "all owners" : "public"),
  stores: {},
}

for (const store of selected) {
  const counts: Record<ShapeClassification | "total", number> = {
    total: 0,
    canonical: 0,
    legacy: 0,
    mixed: 0,
    invalid: 0,
  }
  const markers: Record<string, number> = {}
  const sampleIds: Record<ShapeClassification, string[]> = {
    canonical: [],
    legacy: [],
    mixed: [],
    invalid: [],
  }
  const rows = await scanRows(store)
  rows.sort((a, b) => a.$id.localeCompare(b.$id))
  for (const row of rows) {
    const classified = parseAndClassify(row, store)
    counts.total += 1
    counts[classified.classification] += 1
    for (const marker of classified.markers)
      markers[marker] = (markers[marker] ?? 0) + 1
    if (sampleIds[classified.classification].length < 5)
      sampleIds[classified.classification].push(row.$id)
  }
  const key = `${store.table}/${store.sourceKey ?? store.selector}`
  ;(summary.stores as Record<string, unknown>)[key] = {
    counts,
    markers: sortedRecord(markers),
    samples: sampleIds,
  }
  console.log(`${key}: ${JSON.stringify(counts)}`)
}

const finalJson = JSON.stringify(summary, null, 2)
console.log(finalJson)
if (outFile)
  writeFileSync(path.resolve(root, outFile), `${finalJson}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })

async function scanRows(store: Store): Promise<Row[]> {
  const rows: Row[] = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (store.sourceKey)
      queries.push(Query.equal("source_key", store.sourceKey))
    if (!store.public && owner) queries.push(Query.equal("owner_id", owner))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await listRows({
      databaseId,
      tableId: store.table,
      queries,
      total: false,
    })
    rows.push(...(page.rows as Row[]))
    if (page.rows.length < 100) return rows
    cursor = String(page.rows.at(-1)?.$id ?? "")
  }
}

function parseAndClassify(row: Row, store: Store): ClassificationResult {
  try {
    return store.classify(JSON.parse(String(row.data ?? "null")))
  } catch {
    return {
      classification: "invalid",
      markers: ["data:invalid_json"],
      notes: "row.data is not valid JSON",
    }
  }
}

function argumentValue(name: string): string {
  const direct = process.argv.find((argument) =>
    argument.startsWith(`${name}=`)
  )
  if (direct) return direct.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || "" : ""
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
function sortedRecord(value: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  )
}
