import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { vi } from "vitest"

// Vitest does not expose Vite-loaded server secrets through process.env.
// Load provider credentials before test modules initialize. Empty local
// placeholders must not mask values already loaded from the base environment.
if (existsSync(".env")) {
  loadEnvFile(".env")
}
if (existsSync(".env.local")) {
  const usesLegacyAppwrite =
    process.env.LUMENCLIP_DATA_BACKEND === "appwrite" ||
    process.env.LUMENCLIP_ASSET_BACKEND === "appwrite"
  if (usesLegacyAppwrite) {
    for (const key of [
      "APPWRITE_ENDPOINT",
      "APPWRITE_PROJECT_ID",
      "APPWRITE_API_KEY",
      "APPWRITE_DATABASE_ID",
    ]) {
      delete process.env[key]
    }
  }
  loadEnvFile(".env.local")
}

// CI and local integration runs may provide a dedicated database explicitly.
// Destructive helpers independently verify that this override (or a local
// database) is present before clearing any records.
const testDatabaseUrl = process.env.LUMENCLIP_TEST_DATABASE_URL?.trim()
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl
}

// Appwrite is rollback-only, but keep its original safety boundary when a
// test explicitly selects that legacy backend.
const endpoint = process.env.APPWRITE_ENDPOINT?.trim()
const usesLegacyAppwrite =
  process.env.LUMENCLIP_DATA_BACKEND === "appwrite" ||
  process.env.LUMENCLIP_ASSET_BACKEND === "appwrite"
if (
  usesLegacyAppwrite &&
  endpoint &&
  !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(endpoint)
) {
  throw new Error(
    `Tests clear Appwrite tables and must never point at a remote instance. APPWRITE_ENDPOINT is ${endpoint}. Configure a disposable local Appwrite environment for rollback tests.`
  )
}

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    $id: "vitest-user",
    email: "vitest@lumenclip.test",
    name: "Vitest",
    emailVerification: true,
  }),
}))
