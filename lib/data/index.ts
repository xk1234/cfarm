/**
 * Data layer entry point. Feature code imports only from `@/lib/data`.
 *
 * Backend selection (`LUMENCLIP_DATA_BACKEND`):
 * - `memory`: in-process repositories (forced by vitest.setup.ts).
 * - `appwrite` (default outside tests): Appwrite Cloud TablesDB + Storage.
 *   Not implemented yet; the backend builder replaces
 *   `createAppwriteRepositories` with `lib/data/appwrite/*`.
 */
import { createMemoryRepositories } from "./memory"
import type { Repositories } from "./repositories"

export * from "./types"
export * from "./repositories"
export { createMemoryRepositories, type MemoryRepositoryOptions } from "./memory"
export {
  deterministicJobId,
  generateApiKey,
  hashApiKey,
  leaseId,
  looksLikeApiKey,
  newId,
  sha256Hex,
} from "./crypto"

export type DataBackend = Repositories["backend"]

export class DataBackendNotImplementedError extends Error {
  constructor(backend: string) {
    super(`The ${backend} data backend is not implemented yet.`)
    this.name = "DataBackendNotImplementedError"
  }
}

export function dataBackendFromEnv(env: Record<string, string | undefined> = process.env): DataBackend {
  const raw = env.LUMENCLIP_DATA_BACKEND?.trim().toLowerCase()
  if (raw === "memory" || raw === "appwrite") return raw
  if (raw) throw new Error(`Unknown LUMENCLIP_DATA_BACKEND "${raw}" (expected "memory" or "appwrite").`)
  return env.VITEST || env.NODE_ENV === "test" ? "memory" : "appwrite"
}

/** Placeholder until the Appwrite adapter lands (doc 03 §6). */
export function createAppwriteRepositories(): Repositories {
  throw new DataBackendNotImplementedError("appwrite")
}

let cached: Repositories | null = null

/** Process-wide repositories for the configured backend. */
export function getRepositories(): Repositories {
  if (cached) return cached
  cached = dataBackendFromEnv() === "memory" ? createMemoryRepositories() : createAppwriteRepositories()
  return cached
}

/** Tests: install specific repositories (or `null` to re-read the env). */
export function setRepositoriesForTesting(repositories: Repositories | null): void {
  cached = repositories
}

/** Tests: start from an empty in-memory store. */
export function resetMemoryRepositories(): Repositories {
  cached = createMemoryRepositories()
  return cached
}
