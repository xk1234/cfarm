import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { vi } from "vitest"

if (existsSync(".env")) loadEnvFile(".env")
if (existsSync(".env.local")) loadEnvFile(".env.local")

const databaseUrl = process.env.DATABASE_URL?.trim()
if (
  !databaseUrl ||
  !/localhost|127\.0\.0\.1/.test(databaseUrl)
) {
  throw new Error(
    "Tests require a disposable local PostgreSQL DATABASE_URL. Refusing to clear a remote database."
  )
}

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    $id: "vitest-user",
    email: "vitest@lumenclip.test",
    name: "Vitest",
  }),
}))
