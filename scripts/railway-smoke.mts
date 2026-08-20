import { createHash } from "node:crypto"

const tunnelPort = process.env.RAILWAY_LOCAL_TUNNEL_PORT
if (tunnelPort && process.env.DATABASE_URL) {
  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.hostname = "127.0.0.1"
  databaseUrl.port = tunnelPort
  process.env.DATABASE_URL = databaseUrl.toString()
}

process.env.LUMENCLIP_DATA_BACKEND = "railway"
process.env.LUMENCLIP_ASSET_BACKEND = "railway"

const [
  { RUNTIME_DATABASE_ID, getRuntimeStore },
  { closeRailwayDatabase, getRailwayDatabase },
] = await Promise.all([
  import("../lib/runtime-store"),
  import("../lib/railway/database"),
])

const backend = getRuntimeStore()

try {
  const templates = await backend.records.listRows(
    RUNTIME_DATABASE_ID,
    "templates",
    []
  )
  const sql = getRailwayDatabase()
  const [manifest] = await sql<
    Array<{ source_bucket_id: string; source_file_id: string }>
  >`
    SELECT source_bucket_id, source_file_id
    FROM object_manifest
    ORDER BY source_bucket_id, source_file_id
    LIMIT 1
  `
  if (!manifest) throw new Error("Railway object manifest is empty.")
  const [counts] = await sql<
    Array<{ domain_rows: number; object_rows: number; failures: number }>
  >`
    SELECT
      (SELECT count(*)::int FROM domain_records) AS domain_rows,
      (SELECT count(*)::int FROM object_manifest) AS object_rows,
      (SELECT count(*)::int FROM migration_failures) AS failures
  `
  const identityRows = await sql<
    Array<{
      table_name: string
      row_id: string
      owner_id: string | null
      rid: string | null
      source_row_id: string | null
    }>
  >`
    SELECT
      table_name,
      row_id,
      owner_id,
      rid,
      source_row ->> '$id' AS source_row_id
    FROM domain_records
    WHERE table_name IN ('templates', 'template_runs', 'social_templates')
  `
  const legacyRows = await sql<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM domain_records
    WHERE table_name IN ('automations', 'automation_runs', 'x_automations')
  `
  const templateRowIdMismatches = identityRows.filter(
    (row) =>
      row.row_id !== canonicalRowId(row) || row.source_row_id !== row.row_id
  )
  if (templateRowIdMismatches.length > 0) {
    throw new Error(
      `${templateRowIdMismatches.length} canonical template rows have mismatched physical ids.`
    )
  }
  if (legacyRows[0]?.count) {
    throw new Error(`${legacyRows[0].count} legacy automation rows remain.`)
  }
  const firstAsset = await backend.objects.getFile(
    manifest.source_bucket_id,
    manifest.source_file_id
  )
  const firstAssetBytes = await backend.objects.getFileView(
    manifest.source_bucket_id,
    manifest.source_file_id
  )
  console.log(
    JSON.stringify({
      ok: true,
      templateCount: templates.total,
      firstTemplateId: templates.rows[0]?.$id ?? null,
      assetId: firstAsset.$id,
      assetBytes: firstAsset.sizeOriginal,
      viewedAssetBytes: firstAssetBytes.byteLength,
      domainRows: counts.domain_rows,
      objectRows: counts.object_rows,
      migrationFailures: counts.failures,
      canonicalTemplateRows: identityRows.length,
      templateRowIdMismatches: templateRowIdMismatches.length,
      legacyAutomationRows: legacyRows[0]?.count ?? 0,
    })
  )
} finally {
  await closeRailwayDatabase()
}

function canonicalRowId(row: {
  table_name: string
  row_id: string
  owner_id: string | null
  rid: string | null
}) {
  const ownerId = row.owner_id?.trim() ?? ""
  const rid = row.rid?.trim() ?? ""
  if (!rid) return ""
  if (!ownerId && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(rid)) return rid
  const basis = ownerId
    ? `${row.table_name}:${ownerId}:${rid}`
    : `${row.table_name}:${rid}`
  return `${ownerId ? "u" : "r"}${createHash("sha256")
    .update(basis)
    .digest("hex")
    .slice(0, 35)}`
}
