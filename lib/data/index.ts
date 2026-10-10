/**
 * Data layer entry point. Feature code imports only from `@/lib/data`.
 *
 * Backend selection (`LUMENCLIP_DATA_BACKEND`):
 * - `memory`: in-process repositories (forced by vitest.setup.ts).
 * - `appwrite` (default outside tests): Appwrite Cloud TablesDB + Storage
 *   (`lib/data/appwrite/*`, configured by APPWRITE_ENDPOINT,
 *   APPWRITE_PROJECT_ID and APPWRITE_API_KEY).
 */
import {
  createAppwriteRepositories as createAppwriteBackend,
  type AppwriteRepositoryOptions,
} from "./appwrite"
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
export {
  appBaseUrl,
  createFileToken,
  filePath,
  signedFileUrl,
  verifyFileToken,
  MAX_FILE_TOKEN_SECONDS,
  type FileTokenClaims,
} from "./file-tokens"
export { AppwriteNotConfiguredError, isAppwriteConfigured, type AppwriteRepositoryOptions } from "./appwrite"

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

/** Appwrite Cloud repositories (doc 03 §6). Throws AppwriteNotConfiguredError without credentials. */
export function createAppwriteRepositories(options?: AppwriteRepositoryOptions): Repositories {
  return createAppwriteBackend(options)
}

/**
 * The process-wide repositories live on `globalThis`: Next dev bundles route
 * handlers, server components and the proxy separately, so a module-level
 * variable would give each bundle its own in-memory store.
 */
const CACHE_KEY = Symbol.for("lumenclip.repositories")
type RepositoryCache = { [CACHE_KEY]?: Repositories | null }
const store = globalThis as RepositoryCache

function getCached(): Repositories | null {
  return store[CACHE_KEY] ?? null
}

function setCached(repositories: Repositories | null): void {
  store[CACHE_KEY] = repositories
}

/** Process-wide repositories for the configured backend. */
export function getRepositories(): Repositories {
  const cached = getCached()
  if (cached) return cached
  const created = dataBackendFromEnv() === "memory" ? createMemoryRepositories() : createAppwriteRepositories()
  setCached(created)
  return created
}

/** Tests: install specific repositories (or `null` to re-read the env). */
export function setRepositoriesForTesting(repositories: Repositories | null): void {
  setCached(repositories)
}

/** Tests: start from an empty in-memory store. */
export function resetMemoryRepositories(): Repositories {
  const created = createMemoryRepositories()
  setCached(created)
  return created
}
