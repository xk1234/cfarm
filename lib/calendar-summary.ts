import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { getCurrentUser } from "@/lib/auth"
import { readPostProjection } from "@/lib/post-repository"

export type CalendarAlertSummary = {
  needsAction: number
  failed: number
}

export async function calendarAlertSummary(): Promise<CalendarAlertSummary> {
  const aw = getAppwrite()
  const user = await getCurrentUser()
  if (!aw || !user) return { needsAction: 0, failed: 0 }

  const [failedJobs, publicationSummary] = await Promise.all([
    aw.tables.listRows(APPWRITE_DATABASE_ID, "jobs", [
      Query.equal("owner_id", [user.$id]),
      Query.equal("status", ["failed", "dead"]),
      Query.limit(1),
    ]),
    readPostProjection({
      surface: "calendar_alert_summary",
      legacy: async () => {
        const [needsActionOutputs, failedOutputs] = await Promise.all([
          aw.tables.listRows(APPWRITE_DATABASE_ID, "outputs", [
            Query.equal("owner_id", [user.$id]),
            Query.equal("publication_status", [
              "awaiting_manual_post",
              "ready_for_review",
            ]),
            Query.limit(1),
          ]),
          aw.tables.listRows(APPWRITE_DATABASE_ID, "outputs", [
            Query.equal("owner_id", [user.$id]),
            Query.equal("publication_status", ["failed"]),
            Query.limit(1),
          ]),
        ])
        return {
          needsAction: needsActionOutputs.total,
          failed: failedOutputs.total,
        }
      },
      canonical: (posts) => ({
        needsAction: posts.filter(
          (post) =>
            post.lifecycleStatus === "ready" &&
            (post.publishMode === "manual" || post.publishMode === "review")
        ).length,
        failed: posts.filter((post) => post.lifecycleStatus === "failed")
          .length,
      }),
    }),
  ])

  return {
    needsAction: publicationSummary.needsAction,
    failed: failedJobs.total + publicationSummary.failed,
  }
}
