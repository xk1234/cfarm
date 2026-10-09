import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { getCurrentUser } from "@/lib/auth"
import { readPostProjection } from "@/lib/post-repository"
import { getRailwayOrm } from "@/lib/railway/database"
import { domainRecords, jobs } from "@/lib/railway/schema"
import { listDomainRecords } from "@/lib/railway/domain-record-store"

export type CalendarAlertSummary = {
  needsAction: number
  failed: number
}

type OutputPayload = {
  publications?: unknown
}

export async function calendarAlertSummary(): Promise<CalendarAlertSummary> {
  const user = await getCurrentUser()
  if (!user) return { needsAction: 0, failed: 0 }

  const failedJobs = await getRailwayOrm()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.ownerId, user.$id),
        inArray(jobs.status, ["failed", "dead"])
      )
    )

  const publicationSummary = await readPostProjection({
    surface: "calendar_alert_summary",
    legacy: async () => {
      const outputRows = await listDomainRecords({
        table: "outputs",
        ownerIds: [user.$id],
        limit: 10_000,
        order: "none",
      })
      let needsAction = 0
      let failed = 0
      for (const row of outputRows) {
        const publications = (row.payload as OutputPayload).publications
        if (!Array.isArray(publications)) continue
        const statuses = publications.flatMap((publication) => {
          const status =
            publication && typeof publication === "object"
              ? (publication as Record<string, unknown>).status
              : null
          return typeof status === "string" ? [status] : []
        })
        if (
          statuses.includes("awaiting_manual_post") ||
          statuses.includes("ready_for_review")
        ) {
          needsAction += 1
        }
        if (statuses.includes("failed")) failed += 1
      }
      return { needsAction, failed }
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
  })

  return {
    needsAction: publicationSummary.needsAction,
    failed: failedJobs.length + publicationSummary.failed,
  }
}

// Keep the domain table import adjacent to the ORM usage for future count pushdown.
void domainRecords
