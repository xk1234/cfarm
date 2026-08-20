import { getCurrentUser } from "@/lib/auth"
import { readPostProjection } from "@/lib/post-repository"
import { railwayJobRepository } from "@/lib/railway/job-repository"
import { RecordQuery as Query } from "@/lib/record-query"
import { getRuntimeStore, RUNTIME_DATABASE_ID } from "@/lib/runtime-store"

export type CalendarAlertSummary = {
  needsAction: number
  failed: number
}

export async function calendarAlertSummary(): Promise<CalendarAlertSummary> {
  const aw = getRuntimeStore()
  const user = await getCurrentUser()
  if (!user) return { needsAction: 0, failed: 0 }

  const [jobStats, publicationSummary] = await Promise.all([
    railwayJobRepository.stats(user.$id),
    readPostProjection({
      surface: "calendar_alert_summary",
      legacy: async () => {
        const [needsActionOutputs, failedOutputs] = await Promise.all([
          aw.records.listRows(RUNTIME_DATABASE_ID, "outputs", [
            Query.equal("owner_id", [user.$id]),
            Query.equal("publication_status", [
              "awaiting_manual_post",
              "ready_for_review",
            ]),
            Query.limit(1),
          ]),
          aw.records.listRows(RUNTIME_DATABASE_ID, "outputs", [
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
    failed:
      (jobStats.failed ?? 0) + (jobStats.dead ?? 0) + publicationSummary.failed,
  }
}
