import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { vi } from "vitest"

// Vitest does not expose Vite-loaded server secrets through process.env.
// Load provider credentials from the cloud environment first. Then replace
// only Appwrite with the shared local project so tests can never clear cloud
// data. Empty provider placeholders in .env.local must not mask .env values.
if (existsSync(".env")) {
  loadEnvFile(".env")
}
if (existsSync(".env.local")) {
  for (const key of [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
    "APPWRITE_DATABASE_ID",
  ]) {
    delete process.env[key]
  }
  loadEnvFile(".env.local")
}

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    $id: "vitest-user",
    email: "vitest@lumenclip.test",
    name: "Vitest",
    emailVerification: true,
  }),
}))
