import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { listAutomationRuns } from "@/lib/automation-runner"
import {
  listPostFastPostRecords,
  type PostFastAnalyticsMetric,
} from "@/lib/postfast-posts"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const automationId = searchParams.get("automationId")?.trim()
  const limitValue = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 20
  const runs = await listAutomationRuns({
    automationId: automationId || undefined,
    limit,
  })
  const postRecords = await listPostFastPostRecords().catch(() => [])
  const runsWithViews = runs.map((run) => ({
    ...run,
    views: postRecords
      .filter(
        (record) =>
          (record.sourceType === "automation" && record.sourceId === run.id) ||
          (Boolean(run.slideshowId) &&
            record.sourceType === "slideshow" &&
            record.sourceId === run.slideshowId)
      )
      .reduce(
        (total, record) => total + postFastViewCount(record.analytics),
        0
      ),
  }))

  return NextResponse.json({ runs: runsWithViews })
})

function postFastViewCount(analytics: PostFastAnalyticsMetric[] | undefined) {
  const views = analytics?.find(
    (metric) => metric.label.trim().toLowerCase() === "views"
  )
  return Math.max(
    0,
    ...(views?.data.map((point) => Number(point.total) || 0) ?? [0])
  )
}
