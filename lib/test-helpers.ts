import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"

export const VITEST_OWNER_ID = "vitest-user"

/**
 * Delete test-owned rows from the given tables in the active cfarm database.
 * Shared by store/route tests for setup/teardown so each suite doesn't
 * re-implement the same list-rows/delete-rows drain loop.
 */
export async function clearTestTables(...tables: string[]): Promise<void> {
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("Appwrite is not configured for tests.")
  }
  for (const table of tables) {
    for (;;) {
      const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, table, [
        Query.equal("owner_id", [VITEST_OWNER_ID]),
        Query.limit(100),
      ])
      for (const row of res.rows) {
        try {
          await aw.tables.deleteRow(
            APPWRITE_DATABASE_ID,
            table,
            String(row.$id)
          )
        } catch (error) {
          // Appwrite list results can briefly include a row deleted by another
          // test cleanup pass. Treat that eventual-consistency race as cleared.
          if ((error as { code?: number }).code !== 404) throw error
        }
      }
      if (res.rows.length < 100) break
    }
  }
}
