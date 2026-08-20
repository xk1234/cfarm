import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { dataBackend } from "@/lib/backend-config"

export const VITEST_OWNER_ID = "vitest-user"

/**
 * Refuse to run destructive test helpers against an application database.
 *
 * On 2026-07-28 the suite ran with a repo-root .env and no .env.local, so it
 * silently inherited the production endpoint and deleted live rows. The owner
 * filter below is not sufficient protection on its own: several code paths
 * adopt an owner id from the data they read, so "test-owned" is only true when
 * the database itself is disposable.
 */
function assertDisposableTestBackend() {
  if (dataBackend() === "railway") {
    const databaseUrl = process.env.DATABASE_URL?.trim()
    if (!databaseUrl) {
      throw new Error(
        "Railway PostgreSQL is not configured for tests. Set LUMENCLIP_TEST_DATABASE_URL to a dedicated test database."
      )
    }
    if (databaseUrl === process.env.LUMENCLIP_TEST_DATABASE_URL?.trim()) return

    let hostname = ""
    try {
      hostname = new URL(databaseUrl).hostname
    } catch {
      throw new Error("DATABASE_URL is not a valid PostgreSQL URL.")
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") return
    throw new Error(
      "Refusing to clear a remote Railway database. Set LUMENCLIP_TEST_DATABASE_URL to a dedicated test database."
    )
  }

  const endpoint = process.env.APPWRITE_ENDPOINT?.trim()
  if (
    endpoint &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(endpoint)
  ) {
    throw new Error(
      `Refusing to clear tables on a remote Appwrite (${endpoint}). Configure a disposable local Appwrite environment for rollback tests.`
    )
  }
}

/**
 * Delete test-owned rows from the given tables in the active cfarm database.
 * Shared by store/route tests for setup/teardown so each suite doesn't
 * re-implement the same list-rows/delete-rows drain loop.
 */
export async function clearTestTables(...tables: string[]): Promise<void> {
  assertDisposableTestBackend()
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("The configured persistence backend is unavailable for tests.")
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
