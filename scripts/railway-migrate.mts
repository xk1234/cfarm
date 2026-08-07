import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import postgres from "postgres"

const migrationsDir = path.join(process.cwd(), "infra", "railway", "migrations")
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is required to apply Railway migrations.")
}

const sql = postgres(connectionString, { max: 1, prepare: false })

try {
  await sql`SELECT pg_advisory_lock(hashtext('lumenclip_schema_migrations'))`
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort()

  for (const file of files) {
    const [existing] = await sql<{ name: string }[]>`
      SELECT name FROM schema_migrations WHERE name = ${file}
    `
    if (existing) {
      console.log(`migration ${file}: already applied`)
      continue
    }
    const source = await readFile(path.join(migrationsDir, file), "utf8")
    await sql.begin(async (transaction) => {
      await transaction.unsafe(source)
      await transaction`
        INSERT INTO schema_migrations (name) VALUES (${file})
      `
    })
    console.log(`migration ${file}: applied`)
  }
} finally {
  await sql`SELECT pg_advisory_unlock(hashtext('lumenclip_schema_migrations'))`.catch(
    () => undefined
  )
  await sql.end({ timeout: 5 })
}
