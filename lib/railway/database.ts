import "server-only"

import postgres, { type Sql } from "postgres"

let cachedSql: Sql | null = null

export function railwayDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

/**
 * Shared PostgreSQL client for Railway services. Railway injects DATABASE_URL
 * from the Postgres service over its private network.
 */
export function getRailwayDatabase(): Sql {
  if (cachedSql) return cachedSql
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "Railway PostgreSQL is not configured. Set DATABASE_URL from the Railway Postgres service."
    )
  }
  cachedSql = postgres(connectionString, {
    max: Math.max(
      2,
      Math.min(50, Number(process.env.POSTGRES_POOL_SIZE ?? 10))
    ),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  })
  return cachedSql
}

export async function closeRailwayDatabase(): Promise<void> {
  const sql = cachedSql
  cachedSql = null
  if (sql) await sql.end({ timeout: 5 })
}
