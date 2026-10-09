import "server-only"

import { and, eq } from "drizzle-orm"

import { getRailwayOrm } from "@/lib/railway/database"
import { domainRecords, jobs, outputMedia } from "@/lib/railway/schema"

export const VITEST_OWNER_ID = "vitest-user"

function assertDisposableDatabase() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error("DATABASE_URL is required for Railway tests.")
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Refusing to clear test data on a remote database.")
  }
}

function physicalRoute(table: string) {
  switch (table) {
    case "results":
      return { tableName: "outputs", sourceKey: "result" }
    case "generated_video_exports":
      return { tableName: "outputs", sourceKey: "generated_video" }
    case "assets":
      return {
        tableName: "permanent_assets",
        sourceKey: "uploaded_asset",
      }
    case "image_collections":
      return {
        tableName: "permanent_assets",
        sourceKey: "image_collection",
      }
    default:
      return { tableName: table, sourceKey: "" }
  }
}

/** Delete only the fixed test owner from a disposable local PostgreSQL database. */
export async function clearTestTables(...tables: string[]): Promise<void> {
  assertDisposableDatabase()
  const orm = getRailwayOrm()
  for (const requested of tables) {
    if (requested === "postfast_posts") {
      await clearPublicationWrappers()
      continue
    }
    const route = physicalRoute(requested)
    await orm
      .delete(domainRecords)
      .where(
        and(
          eq(domainRecords.ownerId, VITEST_OWNER_ID),
          eq(domainRecords.tableName, route.tableName),
          route.sourceKey
            ? eq(domainRecords.sourceKey, route.sourceKey)
            : undefined
        )
      )
  }
}

async function clearPublicationWrappers() {
  const orm = getRailwayOrm()
  const rows = await orm
    .select({ rowId: domainRecords.rowId })
    .from(domainRecords)
    .where(
      and(
        eq(domainRecords.ownerId, VITEST_OWNER_ID),
        eq(domainRecords.tableName, "outputs")
      )
    )
  for (const row of rows) {
    await orm
      .delete(domainRecords)
      .where(eq(domainRecords.rowId, row.rowId))
  }
  await orm
    .delete(outputMedia)
    .where(eq(outputMedia.ownerId, VITEST_OWNER_ID))
  await orm.delete(jobs).where(eq(jobs.ownerId, VITEST_OWNER_ID))
}
