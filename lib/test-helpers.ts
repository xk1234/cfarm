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
  for (const requestedTable of tables) {
    if (requestedTable === "postfast_posts") {
      await clearTestPublications(aw)
      continue
    }
    const { table, sourceKey } = testTableRoute(requestedTable)
    for (;;) {
      const queries = [
        Query.equal("owner_id", [VITEST_OWNER_ID]),
        ...(sourceKey ? [Query.equal("source_key", [sourceKey])] : []),
        Query.limit(100),
      ]
      const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, table, queries)
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

async function clearTestPublications(
  aw: NonNullable<ReturnType<typeof getAppwrite>>
) {
  let cursor: string | null = null
  const rows: Array<{ $id: string; source_key?: string }> = []
  for (;;) {
    const queries = [
      Query.equal("owner_id", [VITEST_OWNER_ID]),
      Query.limit(100),
    ]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "outputs",
      queries
    )
    rows.push(...response.rows)
    if (response.rows.length < 100) break
    cursor = String(response.rows.at(-1)?.$id ?? "")
  }

  for (const row of rows) {
    try {
      if (row.source_key === "publication_wrapper") {
        await aw.tables.deleteRow(APPWRITE_DATABASE_ID, "outputs", row.$id)
        continue
      }
      await aw.tables.updateRow(APPWRITE_DATABASE_ID, "outputs", row.$id, {
        publications: "[]",
        publication_status: null,
        scheduled_at: null,
        published_at: null,
        primary_post_id: null,
        primary_release_url: null,
      })
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error
    }
  }
}

function testTableRoute(table: string) {
  switch (table) {
    case "results":
      return { table: "outputs", sourceKey: "result" }
    case "generated_video_exports":
      return { table: "outputs", sourceKey: "generated_video" }
    case "assets":
      return { table: "permanent_assets", sourceKey: "uploaded_asset" }
    case "image_collections":
      return { table: "permanent_assets", sourceKey: "image_collection" }
    default:
      return { table, sourceKey: "" }
  }
}
