import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { Client, Query, TablesDB, Users } from "node-appwrite"
import postgres, { type Sql, type TransactionSql } from "postgres"

type MigrationSql = Sql | TransactionSql

type SourceRow = Record<string, unknown> & {
  $id: string
  $createdAt?: string
  $updatedAt?: string
  $permissions?: string[]
}

const args = new Set(process.argv.slice(2))
const apply = args.has("--apply")
const restart = args.has("--restart")
const envArg = process.argv
  .slice(2)
  .find((value) => value.startsWith("--source-env="))
const onlyArg = process.argv
  .slice(2)
  .find((value) => value.startsWith("--only="))
const batchArg = process.argv
  .slice(2)
  .find((value) => value.startsWith("--batch-size="))
const sourceEnvPath = path.resolve(envArg?.split("=", 2)[1] || ".env")
const batchSize = Math.max(
  1,
  Math.min(100, Number(batchArg?.split("=", 2)[1] || 100))
)
const selectedTables = onlyArg
  ? new Set(
      onlyArg
        .split("=", 2)[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  : null

loadSourceEnvironment(sourceEnvPath)

const endpoint = required("APPWRITE_ENDPOINT")
const projectId = required("APPWRITE_PROJECT_ID")
const apiKey = required("APPWRITE_API_KEY")
const databaseId = process.env.APPWRITE_DATABASE_ID || "cfarm"
const appwrite = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey)
const tables = new TablesDB(appwrite)
const users = new Users(appwrite)
const tableList = await listAllTables()
const inventory = []

for (const table of tableList) {
  if (selectedTables && !selectedTables.has(table.$id)) continue
  const page = await tables.listRows(databaseId, table.$id, [Query.limit(1)])
  inventory.push({ table: table.$id, rows: page.total })
}

const userPage = await users.list({ queries: [Query.limit(1)] })

if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: "inventory",
        sourceProjectId: projectId,
        databaseId,
        users: userPage.total,
        tables: inventory,
        totalRows: inventory.reduce((sum, item) => sum + item.rows, 0),
        next: "Run with --apply inside a Railway service that has DATABASE_URL.",
      },
      null,
      2
    )
  )
  process.exit(0)
}

const databaseUrl = required("DATABASE_URL")
const sql = postgres(databaseUrl, { max: 5, prepare: false })
const runId = `records-${randomUUID()}`
let migratedCount = 0
let failedCount = 0

try {
  await assertMigrationSchema(sql)
  if (restart) {
    const scopes = ["users", ...inventory.map((item) => `table:${item.table}`)]
    await sql`
      DELETE FROM migration_checkpoints
      WHERE migration_kind = 'appwrite-records'
        AND source_scope IN ${sql(scopes)}
    `
  }
  await sql`
    INSERT INTO migration_runs (
      id, migration_kind, source_project_id, status, source_count, details
    ) VALUES (
      ${runId}, 'appwrite-records', ${projectId}, 'running',
      ${inventory.reduce((sum, item) => sum + item.rows, 0) + userPage.total},
      ${sql.json({ databaseId, tables: inventory, users: userPage.total })}
    )
  `

  migratedCount += await migrateUsers(sql)
  for (const item of inventory) {
    migratedCount += await migrateTable(sql, item.table)
  }

  const verification = await verifyCounts(sql, inventory)
  const sourceCovered = verification.every((item) => item.sourceCovered)
  const status = sourceCovered ? "succeeded" : "completed_with_mismatch"
  await sql`
    UPDATE migration_runs
    SET status = ${status}, completed_at = now(),
        migrated_count = ${migratedCount}, failed_count = ${failedCount},
        details = details || ${sql.json({ verification })}
    WHERE id = ${runId}
  `
  console.log(
    JSON.stringify(
      {
        status,
        runId,
        migratedCount,
        failedCount,
        verification,
      },
      null,
      2
    )
  )
  if (!sourceCovered) process.exitCode = 1
} catch (error) {
  failedCount += 1
  const message = error instanceof Error ? error.message : String(error)
  await sql`
    UPDATE migration_runs
    SET status = 'failed', completed_at = now(),
        migrated_count = ${migratedCount}, failed_count = ${failedCount},
        details = details || ${sql.json({ fatalError: message })}
    WHERE id = ${runId}
  `.catch(() => undefined)
  throw error
} finally {
  await sql.end({ timeout: 5 })
}

async function migrateUsers(sqlClient: Sql): Promise<number> {
  const scope = "users"
  const cursor = restart ? null : await checkpoint(sqlClient, scope)
  let nextCursor = cursor
  let migrated = 0
  for (;;) {
    const queries = [Query.limit(batchSize)]
    if (nextCursor) queries.push(Query.cursorAfter(nextCursor))
    const page = await users.list({ queries })
    if (page.users.length === 0) break
    await sqlClient.begin(async (transaction) => {
      const records = page.users.map((user) => ({
        id: user.$id,
        email: user.email,
        name: user.name || "",
        email_verified: user.emailVerification,
        preferences: user.prefs ?? {},
        appwrite_created_at: timestampString(user.$createdAt),
        appwrite_updated_at: timestampString(user.$updatedAt),
      }))
      await transaction`
        INSERT INTO app_users (
          id, email, name, email_verified, preferences,
          appwrite_created_at, appwrite_updated_at, requires_password_reset
        )
        SELECT id, email, name, email_verified, preferences,
          appwrite_created_at, appwrite_updated_at, true
        FROM jsonb_to_recordset(${transaction.json(JSON.parse(JSON.stringify(records)))}::jsonb) AS imported(
          id text, email text, name text, email_verified boolean,
          preferences jsonb, appwrite_created_at timestamptz,
          appwrite_updated_at timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          email_verified = excluded.email_verified,
          preferences = excluded.preferences,
          appwrite_created_at = excluded.appwrite_created_at,
          appwrite_updated_at = excluded.appwrite_updated_at,
          updated_at = now()
      `
      nextCursor = page.users.at(-1)?.$id ?? nextCursor
      migrated += page.users.length
      await writeCheckpoint(
        transaction,
        scope,
        nextCursor,
        page.total,
        page.users.length
      )
    })
    if (page.users.length < batchSize) break
  }
  return migrated
}

async function migrateTable(sqlClient: Sql, tableId: string): Promise<number> {
  const scope = `table:${tableId}`
  const cursor = restart ? null : await checkpoint(sqlClient, scope)
  let nextCursor = cursor
  let migrated = 0
  for (;;) {
    const queries = [Query.limit(batchSize)]
    if (nextCursor) queries.push(Query.cursorAfter(nextCursor))
    const page = await tables.listRows(databaseId, tableId, queries)
    const rows = page.rows as SourceRow[]
    if (rows.length === 0) break
    await sqlClient.begin(async (transaction) => {
      const records = rows.map((row) => ({
        table_name: tableId,
        row_id: row.$id,
        owner_id: textField(row.owner_id),
        source_key: textField(row.source_key),
        rid: textField(row.rid),
        name: textField(row.name),
        status: textField(row.status),
        ord: integerField(row.ord),
        payload: decodePayload(row.data, row),
        source_row: serializableRow(row),
        permissions: row.$permissions ?? [],
        appwrite_created_at: timestampString(row.$createdAt),
        appwrite_updated_at: timestampString(row.$updatedAt),
      }))
      await transaction`
        INSERT INTO domain_records (
          table_name, row_id, owner_id, source_key, rid, name, status, ord,
          payload, source_row, permissions,
          appwrite_created_at, appwrite_updated_at, migrated_at
        )
        SELECT table_name, row_id, owner_id, source_key, rid, name, status,
          ord, payload, source_row, permissions, appwrite_created_at,
          appwrite_updated_at, now()
        FROM jsonb_to_recordset(${transaction.json(JSON.parse(JSON.stringify(records)))}::jsonb) AS imported(
          table_name text, row_id text, owner_id text, source_key text,
          rid text, name text, status text, ord bigint, payload jsonb,
          source_row jsonb, permissions jsonb,
          appwrite_created_at timestamptz, appwrite_updated_at timestamptz
        )
        ON CONFLICT (table_name, row_id) DO UPDATE SET
          owner_id = excluded.owner_id,
          source_key = excluded.source_key,
          rid = excluded.rid,
          name = excluded.name,
          status = excluded.status,
          ord = excluded.ord,
          payload = excluded.payload,
          source_row = excluded.source_row,
          permissions = excluded.permissions,
          appwrite_created_at = excluded.appwrite_created_at,
          appwrite_updated_at = excluded.appwrite_updated_at,
          migrated_at = now()
      `
      nextCursor = rows.at(-1)?.$id ?? nextCursor
      migrated += rows.length
      await writeCheckpoint(
        transaction,
        scope,
        nextCursor,
        page.total,
        rows.length
      )
    })
    if (rows.length < batchSize) break
  }
  console.log(`table ${tableId}: ${migrated} rows migrated`)
  return migrated
}

async function checkpoint(
  sqlClient: MigrationSql,
  scope: string
): Promise<string | null> {
  const [row] = await sqlClient<{ last_source_id: string | null }[]>`
    SELECT last_source_id
    FROM migration_checkpoints
    WHERE migration_kind = 'appwrite-records' AND source_scope = ${scope}
  `
  return row?.last_source_id ?? null
}

async function writeCheckpoint(
  sqlClient: MigrationSql,
  scope: string,
  lastSourceId: string | null,
  sourceCount: number,
  migratedCountForRun: number
): Promise<void> {
  await sqlClient`
    INSERT INTO migration_checkpoints (
      migration_kind, source_scope, last_source_id,
      source_count, migrated_count, updated_at
    ) VALUES (
      'appwrite-records', ${scope}, ${lastSourceId},
      ${sourceCount}, ${migratedCountForRun}, now()
    )
    ON CONFLICT (migration_kind, source_scope) DO UPDATE SET
      last_source_id = excluded.last_source_id,
      source_count = excluded.source_count,
      migrated_count = migration_checkpoints.migrated_count + excluded.migrated_count,
      updated_at = now()
  `
}

async function verifyCounts(
  sqlClient: Sql,
  sourceInventory: Array<{ table: string; rows: number }>
) {
  const target = await sqlClient<Array<{ table_name: string; count: string }>>`
    SELECT table_name, count(*)::text AS count
    FROM domain_records
    GROUP BY table_name
  `
  const targetCounts = new Map(
    target.map((row) => [row.table_name, Number(row.count)])
  )
  return sourceInventory.map((item) => ({
    table: item.table,
    source: item.rows,
    target: targetCounts.get(item.table) ?? 0,
    matches: item.rows === (targetCounts.get(item.table) ?? 0),
    sourceCovered: item.rows <= (targetCounts.get(item.table) ?? 0),
  }))
}

async function assertMigrationSchema(sqlClient: Sql): Promise<void> {
  const [row] = await sqlClient<{ present: boolean }[]>`
    SELECT to_regclass('public.domain_records') IS NOT NULL AS present
  `
  if (!row?.present) {
    throw new Error(
      "Railway schema is missing. Run pnpm railway:db:migrate first."
    )
  }
}

async function listAllTables() {
  const output: Array<{ $id: string; name: string }> = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await tables.listTables(databaseId, queries)
    output.push(
      ...page.tables.map((table) => ({ $id: table.$id, name: table.name }))
    )
    if (page.tables.length < 100) break
    cursor = page.tables.at(-1)?.$id ?? null
  }
  return output
}

function decodePayload(value: unknown, fallback: SourceRow): unknown {
  if (typeof value !== "string") return value ?? fallback
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return { value }
  }
}

function serializableRow(row: SourceRow): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}

function textField(value: unknown): string | null {
  return value == null || value === "" ? null : String(value)
}

function integerField(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function timestamp(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function timestampString(value: unknown): string | null {
  return timestamp(value)?.toISOString() ?? null
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function loadSourceEnvironment(filePath: string): void {
  if (!existsSync(filePath)) return
  const values = parseEnv(readFileSync(filePath, "utf8"))
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] == null) process.env[key] = value
  }
}
