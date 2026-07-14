import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { automationRunProgress } from "@/lib/automation-run-progress"
import { listAutomationRuns } from "@/lib/automation-runner"
import {
  listGeneratedVideoExports,
  type GeneratedVideoExport,
} from "@/lib/generated-videos"
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
  const [automationRuns, videoExports, postRecords] = await Promise.all([
    listAutomationRuns({
      automationId: automationId || undefined,
      limit,
    }),
    listGeneratedVideoExports({
      automationId: automationId || undefined,
    }),
    listPostFastPostRecords().catch(() => []),
  ])
  const videoRuns = videoExports.flatMap((item) => {
    const run = generatedVideoRun(item)
    return run ? [run] : []
  })
  const runs = [...automationRuns, ...videoRuns]
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime()
    )
    .slice(0, limit)
  const runsWithViews = runs.map((run) => ({
    ...run,
    ...(run.status === "running"
      ? { progress: automationRunProgress(run.id) }
      : {}),
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

function generatedVideoRun(item: GeneratedVideoExport) {
  const automationId = stringValue(item.sourceConfig.automationId)
  if (!automationId) {
    return null
  }

  return {
    id: item.id,
    automationId,
    automationTitle:
      stringValue(item.sourceConfig.automationName) || item.title,
    status: generatedVideoRunStatus(item.status),
    createdAt: item.createdAt,
    slideshowId: undefined,
    videoUrl: item.videoUrl,
    thumbnailUrl: item.previewUrl,
    error: item.error,
    plan: {
      title: item.title,
      caption: item.description || item.caption,
      hashtags: item.hashtags.join(" "),
      hook: stringValue(item.sourceConfig.hook),
      publishType: "video",
    },
  }
}

function generatedVideoRunStatus(status: GeneratedVideoExport["status"]) {
  if (status === "ready") return "succeeded" as const
  if (status === "failed") return "failed" as const
  return "running" as const
}

function postFastViewCount(analytics: PostFastAnalyticsMetric[] | undefined) {
  const views = analytics?.find(
    (metric) => metric.label.trim().toLowerCase() === "views"
  )
  return Math.max(
    0,
    ...(views?.data.map((point) => Number(point.total) || 0) ?? [0])
  )
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
