import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { vi } from "vitest"

// Vitest does not expose Vite-loaded server secrets through process.env.
// Load the local environment before test modules import Appwrite. Tests use the
// same `cfarm` database as the application while the product is in testing.
if (existsSync(".env")) {
  loadEnvFile(".env")
}

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    $id: "vitest-user",
    email: "vitest@lumenclip.test",
    name: "Vitest",
    emailVerification: true,
  }),
}))
