import { resetMemoryRepositories, type Repositories } from "@/lib/data"

/** Workspace id of the Clerk session mocked in vitest.setup.ts. */
export const VITEST_OWNER_ID = "vitest-user"

/**
 * Fresh in-memory repositories installed as the process-wide backend, so
 * route handlers that call `getRepositories()` see the same store as the test.
 */
export function freshTestRepositories(): Repositories {
  return resetMemoryRepositories()
}
