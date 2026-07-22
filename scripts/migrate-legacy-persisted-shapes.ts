/** Backup-first, dry-run-by-default migration of legacy consolidated payloads. */
import { createHash } from "node:crypto"
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import { execFileSync } from "node:child_process"
import { Client, Query, TablesDB } from "node-appwrite"
import { canonicalRowFields } from "../lib/consolidated-records"
import type { StoreRoute } from "../lib/appwrite-stores"
import {
  classifyAutomation,
  classifyAutomationTemplate,
  classifyImageCollection,
  type ClassificationResult,
} from "./legacy-shapes/classify"
import {
  convertAutomationTemplateV1toV2,
  convertAutomationV1toV2,
  convertImageCollectionV1toV2,
  type ConversionResult,
} from "./legacy-shapes/convert"

type Row = Record<string, unknown> & { $id: string }
type Store = {
  selector: string
  physicalSourceKey?: string
  route: StoreRoute
  classify: (v: unknown) => ClassificationResult
  convert: (v: unknown) => ConversionResult
}
type Counts = {
  scanned: number
  canonical: number
  legacy: number
  mixed: number
  invalid: number
  changed: number
  already_migrated: number
  blocked_conflict: number
  write_failures: number
  verification_failures: number
}
type BackupManifest = {
  version: 2
  createdAt: string
  endpoint: string
  project: string
  database: string
  filters: { stores: string[]; owner: string }
  counts: Record<string, number>
  files: Record<string, { sha256: string; rows: number }>
  gitRev: string
}

const stores: Store[] = [
  store(
    "automation_template",
    "permanent_assets",
    "automation_template",
    true,
    classifyAutomationTemplate,
    convertAutomationTemplateV1toV2
  ),
  store(
    "automations",
    "automations",
    undefined,
    false,
    classifyAutomation,
    convertAutomationV1toV2
  ),
  store(
    "image_collection",
    "permanent_assets",
    "image_collection",
    false,
    classifyImageCollection,
    convertImageCollectionV1toV2
  ),
]
const allowed = new Set([
  "--env-file",
  "--store",
  "--owner",
  "--all-owners",
  "--apply",
  "--restore",
  "--confirm",
])
for (const arg of process.argv.slice(2))
  if (arg.startsWith("--") && !allowed.has(arg.split("=", 1)[0]))
    throw new Error(`Unknown flag: ${arg.split("=", 1)[0]}`)
const root = path.resolve(import.meta.dirname, "..")
const envFile = argument("--env-file")
const selector = argument("--store")
const owner = argument("--owner")
const allOwners = process.argv.includes("--all-owners")
const apply = process.argv.includes("--apply") // THE ONLY MUTATION GATE.
const restoreFile = argument("--restore")
if (!envFile) throw new Error("Pass --env-file=<path> explicitly.")
if (owner && allOwners) throw new Error("Use either --owner or --all-owners.")
if (!restoreFile && !selector)
  throw new Error(
    "Pass --store=automation_template|automations|image_collection|all."
  )
if (restoreFile && selector)
  throw new Error("--restore and --store are mutually exclusive.")
const selected = restoreFile
  ? []
  : selector === "all"
    ? stores
    : stores.filter((s) => s.selector === selector)
if (!restoreFile && !selected.length)
  throw new Error(`Unknown store: ${selector}`)
if (
  !restoreFile &&
  selected.some((s) => !s.route.public) &&
  !owner &&
  !allOwners
)
  throw new Error("Private stores require --owner=<id> or --all-owners.")

const env = parseEnv(readFileSync(path.resolve(root, envFile), "utf8"))
const endpoint = clean(env.APPWRITE_ENDPOINT)
const projectId = clean(env.APPWRITE_PROJECT_ID)
const apiKey = clean(env.APPWRITE_API_KEY)
const databaseId = clean(env.APPWRITE_DATABASE_ID) || "cfarm"
if (!endpoint || !projectId || !apiKey)
  throw new Error(
    `${envFile} must define APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY.`
  )
const tables = new TablesDB(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
)

console.log(
  JSON.stringify(
    {
      endpoint,
      project: projectId,
      database: databaseId,
      stores: restoreFile ? ["restore"] : selected.map((s) => s.selector),
      owner: owner || (allOwners ? "all owners" : "public"),
      mode: restoreFile
        ? apply
          ? "RESTORE APPLY"
          : "RESTORE PREVIEW"
        : apply
          ? "APPLY"
          : "DRY-RUN",
    },
    null,
    2
  )
)
if (restoreFile) await restore(path.resolve(root, restoreFile))
else await migrate()

async function migrate() {
  const captured = new Map<Store, Row[]>()
  const beforeCounts = new Map<string, number>()
  const beforeIdentities = new Map<string, string[]>()
  for (const spec of selected) {
    const rows = await listRows(spec)
    captured.set(spec, rows)
    for (const row of rows) {
      beforeCounts.set(
        scopeKey(spec, row),
        (beforeCounts.get(scopeKey(spec, row)) ?? 0) + 1
      )
      const key = scopeKey(spec, row)
      beforeIdentities.set(key, [
        ...(beforeIdentities.get(key) ?? []),
        identity(row),
      ])
    }
  }
  let backup: { dir: string; manifest: BackupManifest } | null = null
  if (apply) backup = writeAndValidateBackup(captured) // BACKUP COMPLETES AND IS VALIDATED BEFORE ANY updateRow.

  let failed = false
  for (const spec of selected) {
    const counts: Counts = {
      scanned: 0,
      canonical: 0,
      legacy: 0,
      mixed: 0,
      invalid: 0,
      changed: 0,
      already_migrated: 0,
      blocked_conflict: 0,
      write_failures: 0,
      verification_failures: 0,
    }
    for (const row of captured.get(spec) ?? []) {
      counts.scanned++
      const parsed = parseRow(row)
      if (!parsed) {
        counts.invalid++
        failed = true
        continue
      }
      const classified = spec.classify(parsed)
      counts[classified.classification]++
      if (classified.classification === "invalid") {
        failed = true
        continue
      }
      const converted = spec.convert(parsed)
      const blocked = converted.warnings.some((w) =>
        w.startsWith("BLOCKED_CONFLICT")
      )
      if (blocked) {
        counts.blocked_conflict++
        failed = true
        console.error(
          JSON.stringify({
            blocked_conflict: row.$id,
            warnings: converted.warnings,
          })
        )
        continue
      }
      if (!converted.changed) {
        counts.already_migrated++
        continue
      }
      counts.changed++
      const nextFields = canonicalRowFields(
        spec.route,
        converted.data,
        converted.data
      )
      console.log(
        JSON.stringify({
          table: spec.route.table,
          source_key: spec.physicalSourceKey ?? null,
          $id: row.$id,
          rid: row.rid ?? null,
          owner: row.owner_id ?? null,
          markers: classified.markers,
          changedPaths: changedPaths(parsed, converted.data),
          droppedPaths: converted.droppedPaths,
          beforeHash: hash(String(row.data)),
          afterHash: hash(String(nextFields.data)),
        })
      )
      if (!apply) continue
      try {
        const fresh = await getRow(spec.route.table, row.$id)
        if (
          fresh.$updatedAt !== row.$updatedAt ||
          hash(String(fresh.data)) !== hash(String(row.data))
        )
          throw new Error("concurrent $updatedAt/data drift")
        await tables.updateRow({
          databaseId,
          tableId: spec.route.table,
          rowId: row.$id,
          data: nextFields,
        })
        const reread = await getRow(spec.route.table, row.$id)
        const verified = parseRow(reread)
        if (
          !verified ||
          spec.classify(verified).classification !== "canonical" ||
          stable(verified) !== stable(converted.data) ||
          identity(reread) !== identity(row) ||
          !Object.entries(nextFields).every(
            ([key, value]) => stable(reread[key]) === stable(value)
          )
        )
          throw new Error("post-write canonical/data verification failed")
      } catch (error) {
        counts.write_failures++
        failed = true
        console.error(`${spec.selector}/${row.$id}: ${message(error)}`)
      }
    }
    console.log(
      `${spec.route.table}/${spec.physicalSourceKey ?? spec.selector}: ${JSON.stringify(counts)}`
    )
  }
  if (apply) {
    const afterCounts = new Map<string, number>()
    const afterIdentities = new Map<string, string[]>()
    for (const spec of selected)
      for (const row of await listRows(spec)) {
        afterCounts.set(
          scopeKey(spec, row),
          (afterCounts.get(scopeKey(spec, row)) ?? 0) + 1
        )
        const key = scopeKey(spec, row)
        afterIdentities.set(key, [
          ...(afterIdentities.get(key) ?? []),
          identity(row),
        ])
      }
    if (
      stable(Object.fromEntries(beforeCounts)) !==
      stable(Object.fromEntries(afterCounts))
    ) {
      failed = true
      console.error("Pre/post scoped row counts differ.")
    }
    if (
      stable(normalizedIdentities(beforeIdentities)) !==
      stable(normalizedIdentities(afterIdentities))
    ) {
      failed = true
      console.error(
        "Pre/post row identity, ownership, ordering, or permissions differ."
      )
    }
    console.log(`Backup manifest: ${backup?.dir}/manifest.json`)
  }
  if (failed) process.exitCode = 1
}

function writeAndValidateBackup(captured: Map<Store, Row[]>) {
  const stamp = new Date().toISOString().replaceAll(":", "-")
  const dir = path.join(
    root,
    "backups",
    "legacy-shapes",
    `${safe(projectId)}-${safe(databaseId)}-${stamp}`
  )
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const manifest: BackupManifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    endpoint,
    project: projectId,
    database: databaseId,
    filters: {
      stores: selected.map((s) => s.selector),
      owner: owner || (allOwners ? "all owners" : "public"),
    },
    counts: {},
    files: {},
    gitRev: gitRevision(),
  }
  for (const spec of selected) {
    const name = `${spec.route.table}-${spec.physicalSourceKey ?? spec.selector}.ndjson`
    const rows = captured.get(spec) ?? []
    const contents =
      rows
        .map((row) =>
          JSON.stringify({ ...row, capturedAt: manifest.createdAt })
        )
        .join("\n") + (rows.length ? "\n" : "")
    durableWrite(path.join(dir, name), contents)
    const actual = readFileSync(path.join(dir, name), "utf8")
    if (
      actual !== contents ||
      actual.split("\n").filter(Boolean).length !== rows.length
    )
      throw new Error(`Backup validation failed: ${name}`)
    manifest.files[name] = { sha256: hash(actual), rows: rows.length }
    manifest.counts[name] = rows.length
  }
  durableWrite(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  return { dir, manifest }
}

async function restore(manifestPath: string) {
  if (!apply)
    throw new Error("Restore requires --apply; no mutation was attempted.")
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8")
  ) as BackupManifest
  if (
    manifest.endpoint !== endpoint ||
    manifest.project !== projectId ||
    manifest.database !== databaseId
  )
    throw new Error("Restore manifest endpoint/project/database mismatch.")
  if (argument("--confirm") !== `restore-${projectId}`)
    throw new Error(`Restore requires --confirm=restore-${projectId}.`)
  const dir = path.dirname(manifestPath)
  for (const [name, expected] of Object.entries(manifest.files)) {
    const contents = readFileSync(path.join(dir, name), "utf8")
    if (hash(contents) !== expected.sha256)
      throw new Error(`Backup hash mismatch: ${name}`)
    const rows = contents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Row)
    if (rows.length !== expected.rows)
      throw new Error(`Backup row count mismatch: ${name}`)
    for (const original of rows) {
      const tableId = name.startsWith("automations-")
        ? "automations"
        : "permanent_assets"
      const current = await getRow(tableId, original.$id)
      console.log(
        JSON.stringify({
          restore: `${tableId}/${original.$id}`,
          beforeHash: hash(String(current.data)),
          afterHash: hash(String(original.data)),
        })
      )
      const data = Object.fromEntries(
        Object.entries(original).filter(
          ([key]) => !key.startsWith("$") && key !== "capturedAt"
        )
      )
      await tables.updateRow({
        databaseId,
        tableId,
        rowId: original.$id,
        data,
        permissions: Array.isArray(original.$permissions)
          ? (original.$permissions as string[])
          : undefined,
      })
      const verified = await getRow(tableId, original.$id)
      if (hash(String(verified.data)) !== hash(String(original.data)))
        throw new Error(
          `Restore verification failed: ${tableId}/${original.$id}`
        )
    }
  }
}

async function listRows(spec: Store): Promise<Row[]> {
  const rows: Row[] = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (spec.physicalSourceKey)
      queries.push(Query.equal("source_key", spec.physicalSourceKey))
    if (!spec.route.public && owner)
      queries.push(Query.equal("owner_id", owner))
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await tables.listRows({
      databaseId,
      tableId: spec.route.table,
      queries,
      total: false,
    })
    rows.push(...(page.rows as Row[]))
    if (page.rows.length < 100)
      return rows.sort((a, b) => a.$id.localeCompare(b.$id))
    cursor = String(page.rows.at(-1)?.$id ?? "")
  }
}
async function getRow(tableId: string, rowId: string): Promise<Row> {
  return (await tables.getRow({ databaseId, tableId, rowId })) as Row
}
function store(
  selector: string,
  table: StoreRoute["table"],
  sourceKey: string | undefined,
  isPublic: boolean,
  classify: Store["classify"],
  convert: Store["convert"]
): Store {
  return {
    selector,
    physicalSourceKey: sourceKey,
    route: { table, sourceKey: sourceKey ?? selector, public: isPublic },
    classify,
    convert,
  }
}
function parseRow(row: Row): Record<string, unknown> | null {
  try {
    const v = JSON.parse(String(row.data))
    return v && typeof v === "object" && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (stable(a) === stable(b)) return []
  const ar = record(a),
    br = record(b)
  if (!ar || !br) return [prefix || "/"]
  return [...new Set([...Object.keys(ar), ...Object.keys(br)])]
    .sort()
    .flatMap((k) =>
      changedPaths(
        ar[k],
        br[k],
        `${prefix}/${k.replaceAll("~", "~0").replaceAll("/", "~1")}`
      )
    )
}
function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`
  const r = record(v)
  if (r)
    return `{${Object.keys(r)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(r[k])}`)
      .join(",")}}`
  return JSON.stringify(v)
}
function hash(v: string): string {
  return createHash("sha256").update(v).digest("hex")
}
function durableWrite(file: string, contents: string) {
  const fd = openSync(file, "wx", 0o600)
  try {
    writeSync(fd, contents, null, "utf8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function scopeKey(spec: Store, row: Row) {
  return `${spec.route.table}/${spec.physicalSourceKey ?? spec.selector}/${String(row.owner_id ?? "public")}`
}
function identity(row: Row) {
  return stable({
    $id: row.$id,
    rid: row.rid,
    ord: row.ord,
    owner_id: row.owner_id,
    $permissions: row.$permissions,
  })
}
function normalizedIdentities(value: Map<string, string[]>) {
  return Object.fromEntries(
    [...value].map(([key, identities]) => [key, identities.sort()])
  )
}
function argument(name: string): string {
  const direct = process.argv.find((a) => a.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] || "" : ""
}
function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}
function safe(v: string) {
  return v.replace(/[^a-zA-Z0-9_.-]/g, "_")
}
function message(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim()
  } catch {
    return "unknown"
  }
}
