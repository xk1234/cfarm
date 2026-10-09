import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { vi } from "vitest"

if (existsSync(".env")) loadEnvFile(".env")
if (existsSync(".env.local")) loadEnvFile(".env.local")

// Unit tests never touch Appwrite Cloud. `getRepositories()` in
// `@/lib/data` selects the in-memory adapter when LUMENCLIP_DATA_BACKEND is
// "memory", which is forced here regardless of local env files.
process.env.LUMENCLIP_DATA_BACKEND = "memory"
delete process.env.APPWRITE_API_KEY

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    $id: "vitest-user",
    email: "vitest@lumenclip.test",
    name: "Vitest",
  }),
}))
