import "server-only"

import postgres, { type Sql } from "postgres"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"

import * as schema from "@/lib/railway/schema"

let cachedSql: Sql | null = null
let cachedDatabase: PostgresJsDatabase<typeof schema> | null = null

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
    max: Number(process.env.POSTGRES_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  })
  return cachedSql
}

/** Typed query builder over the shared Railway connection. */
export function getRailwayOrm(): PostgresJsDatabase<typeof schema> {
  if (cachedDatabase) return cachedDatabase
  cachedDatabase = drizzle(getRailwayDatabase(), { schema })
  return cachedDatabase
}

export async function closeRailwayDatabase(): Promise<void> {
  const sql = cachedSql
  cachedSql = null
  cachedDatabase = null
  if (sql) await sql.end({ timeout: 5 })
}
