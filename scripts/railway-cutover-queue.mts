import postgres from "postgres"

const tunnelPort = process.env.RAILWAY_LOCAL_TUNNEL_PORT
if (tunnelPort && process.env.DATABASE_URL) {
  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.hostname = "127.0.0.1"
  databaseUrl.port = tunnelPort
  process.env.DATABASE_URL = databaseUrl.toString()
}

const apply = process.argv.includes("--apply")
const sql = postgres(required("DATABASE_URL"), { max: 1, prepare: false })

try {
  const pending = await sql<
    Array<{ type: string | null; status: string; count: number }>
  >`
    SELECT source_row->>'type' AS type, source_row->>'status' AS status,
           count(*)::int AS count
    FROM domain_records
    WHERE table_name = 'jobs'
      AND source_row->>'status' IN ('queued', 'processing')
    GROUP BY source_row->>'type', source_row->>'status'
    ORDER BY type, status
  `

  if (apply && pending.length > 0) {
    const reason =
      "Suppressed during Railway cutover: pre-existing job was not replayed."
    await sql`
      UPDATE domain_records
      SET source_row = source_row || jsonb_build_object(
            'status', 'dead',
            'error', ${reason}::text,
            'leased_by', null,
            'leased_until', null,
            'updated_at', now()::text,
            '$updatedAt', now()::text
          ),
          status = 'dead', appwrite_updated_at = now(), migrated_at = now()
      WHERE table_name = 'jobs'
        AND source_row->>'status' IN ('queued', 'processing')
    `
  }

  console.log(
    JSON.stringify({
      mode: apply ? "applied" : "inventory",
      pending,
      affected: pending.reduce((sum, row) => sum + row.count, 0),
    })
  )
} finally {
  await sql.end({ timeout: 5 })
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}
