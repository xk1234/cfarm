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
  { APPWRITE_DATABASE_ID, getAppwrite },
  { closeRailwayDatabase, getRailwayDatabase },
] = await Promise.all([
  import("../lib/appwrite"),
  import("../lib/railway/database"),
])

const backend = getAppwrite()
if (!backend) throw new Error("Railway backend did not initialize.")

try {
  const automations = await backend.tables.listRows(
    APPWRITE_DATABASE_ID,
    "automations",
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
  const firstAsset = await backend.storage.getFile(
    manifest.source_bucket_id,
    manifest.source_file_id
  )
  const firstAssetBytes = await backend.storage.getFileView(
    manifest.source_bucket_id,
    manifest.source_file_id
  )
  console.log(
    JSON.stringify({
      ok: true,
      automationCount: automations.total,
      firstAutomationId: automations.rows[0]?.$id ?? null,
      assetId: firstAsset.$id,
      assetBytes: firstAsset.sizeOriginal,
      viewedAssetBytes: firstAssetBytes.byteLength,
      domainRows: counts.domain_rows,
      objectRows: counts.object_rows,
      migrationFailures: counts.failures,
    })
  )
} finally {
  await closeRailwayDatabase()
}
