import postgres from "postgres"

import { migrateTemplateToFixedSlideCount } from "@/lib/fixed-slideshow-count-migration"

const tunnelPort = process.env.RAILWAY_LOCAL_TUNNEL_PORT
if (tunnelPort && process.env.DATABASE_URL) {
  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.hostname = "127.0.0.1"
  databaseUrl.port = tunnelPort
  process.env.DATABASE_URL = databaseUrl.toString()
}

const apply = process.argv.includes("--apply")
const sql = postgres(required("DATABASE_URL"), { max: 1, prepare: false })
const lockId = 2_026_08_10_1

try {
  await sql`SELECT pg_advisory_lock(${lockId})`
  const [templates, usage, runs, outputs] = await Promise.all([
    rows("templates"),
    rows("usage_ledger"),
    rows("template_runs"),
    rows("outputs"),
  ])
  const publishedRunIds = new Set(
    outputs.flatMap((row) => {
      const source = object(row.source_row)
      const publications = Array.isArray(source.publications)
        ? source.publications.map(object)
        : []
      const published =
        source.publication_status === "published" ||
        Boolean(source.published_at) ||
        publications.some((publication) => publication.status === "published")
      return published && source.source_run_id
        ? [String(source.source_run_id)]
        : []
    })
  )
  const publishedHookIds = new Set(
    usage.flatMap((row) => {
      const payload = object(row.payload)
      return payload.kind === "hook_published" && payload.hook_id
        ? [String(payload.hook_id)]
        : []
    })
  )
  for (const row of runs) {
    const payload = object(row.payload)
    const plan = object(payload.plan)
    const published =
      Boolean(payload.manuallyPublishedAt) ||
      publishedRunIds.has(String(payload.id ?? row.row_id))
    if (published && plan.hookId) publishedHookIds.add(String(plan.hookId))
  }

  const now = new Date().toISOString()
  const report: Array<Record<string, unknown>> = []
  const updates: Array<{
    rowId: string
    payload: Record<string, unknown>
    sourceRow: Record<string, unknown>
  }> = []
  for (const row of templates) {
    const payload = object(row.payload)
    if (object(payload.schema).automationKind !== "slideshow") continue
    const migrated = migrateTemplateToFixedSlideCount({
      record: payload,
      publishedHookIds,
      now,
    })
    const sourceRow = object(row.source_row)
    const sourceData = parseObject(sourceRow.data)
    const migratedSource = migrateTemplateToFixedSlideCount({
      record: sourceData,
      publishedHookIds,
      now,
    })
    if (migrated.changed || migratedSource.changed) {
      updates.push({
        rowId: String(row.row_id),
        payload: migrated.record,
        sourceRow: {
          ...sourceRow,
          data: JSON.stringify(migratedSource.record),
          $updatedAt: now,
        },
      })
    }
    report.push({
      templateId: payload.id ?? row.row_id,
      name: payload.name,
      changed: migrated.changed || migratedSource.changed,
      fixedSlideCount: migrated.fixedSlideCount,
      disabledHookIds: migrated.disabledHookIds,
      deletedHookIds: migrated.deletedHookIds,
    })
  }

  if (apply && updates.length > 0) {
    await sql.begin(async (transaction) => {
      for (const update of updates) {
        await transaction`
          UPDATE domain_records
          SET payload = ${transaction.json(JSON.parse(JSON.stringify(update.payload)))},
              source_row = ${transaction.json(JSON.parse(JSON.stringify(update.sourceRow)))},
              appwrite_updated_at = ${now},
              migrated_at = now()
          WHERE table_name = 'templates' AND row_id = ${update.rowId}
        `
      }
    })
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "inventory",
        publishedHookIds: [...publishedHookIds].sort(),
        templatesScanned: templates.length,
        templatesChanged: updates.length,
        report: report.filter(
          (item) =>
            item.changed ||
            (item.disabledHookIds as string[]).length > 0 ||
            (item.deletedHookIds as string[]).length > 0
        ),
      },
      null,
      2
    )
  )
} finally {
  await sql`SELECT pg_advisory_unlock(${lockId})`.catch(() => undefined)
  await sql.end({ timeout: 5 })
}

async function rows(tableName: string) {
  return sql<Array<{ row_id: string; payload: unknown; source_row: unknown }>>`
    SELECT row_id, payload, source_row
    FROM domain_records
    WHERE table_name = ${tableName}
    ORDER BY row_id
  `
}

function parseObject(value: unknown) {
  if (typeof value !== "string") return object(value)
  try {
    return object(JSON.parse(value))
  } catch {
    return {}
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}
