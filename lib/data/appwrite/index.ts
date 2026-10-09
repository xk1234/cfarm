/**
 * Appwrite Cloud backend (TablesDB + Storage). Only this directory imports
 * node-appwrite; feature code uses `getRepositories()` from `@/lib/data`.
 */
export { createAppwriteRepositories, leaseRowId, storedFileName, type AppwriteRepositoryOptions } from "./repositories"
export {
  AppwriteNotConfiguredError,
  appwriteEnvFrom,
  createAppwriteClients,
  isAppwriteConfigured,
  type StorageApi,
  type StoredFile,
  type TablesApi,
} from "./client"
export { DataIntegrityError, isAppwriteQuotaError, isConflict, isNotFound, toDataError } from "./errors"
export { BUCKET_DEFS, TABLE_DEFS, TABLES, appwriteIdsFromEnv } from "./schema.mjs"
