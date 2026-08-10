import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { slideshowDeliveryLinks } from "@/lib/asset-urls"
import { getCurrentUser } from "@/lib/auth"
import { automationRunProgress } from "@/lib/automation-run-progress"
import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import {
  listGeneratedVideoExports,
  type GeneratedVideoExport,
} from "@/lib/generated-videos"
import {
  type PostFastAnalyticsMetric,
  type PostFastPostRecord,
} from "@/lib/postfast-posts"
import {
  listPublicationRecordsForRead,
  readPostProjection,
} from "@/lib/post-repository"
import { listMetricSnapshots } from "@/lib/postfast-metric-snapshots"
import type { Post } from "@/lib/posts"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const user = await getCurrentUser()
  const { searchParams } = new URL(request.url)
  const automationId = searchParams.get("templateId")?.trim()
  const limitValue = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 20
  const postRecordsPromise = listPublicationRecordsForRead({
    surface: "automation_runs_publications",
  }).catch(() => [])
  const [automationRuns, videoExports, postRecords] = await Promise.all([
    listAutomationRuns({
      automationId: automationId || undefined,
      limit,
      postRecords: postRecordsPromise,
    }),
    listGeneratedVideoExports({
      automationId: automationId || undefined,
    }),
    postRecordsPromise,
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
  const viewsByRun = await readPostProjection({
    surface: "automation_runs_analytics",
    legacy: async () => legacyViewsByRun(runs, postRecords),
    canonical: async (posts) =>
      canonicalViewsByRun(
        runs,
        posts,
        await listMetricSnapshots().catch(() => [])
      ),
  })
  const runsWithViews = runs.map((run) => ({
    ...run,
    ...(user && run.slideshowId
      ? {
          workflowUrl: slideshowDeliveryLinks({
            ownerId: user.$id,
            outputId: run.slideshowId,
          })?.workflowUrl,
        }
      : {}),
    ...(run.status === "running"
      ? { progress: automationRunProgress(run.id) }
      : {}),
    views: viewsByRun[run.id] ?? 0,
  }))

  return NextResponse.json({ runs: runsWithViews })
})

function legacyViewsByRun(
  runs: Array<Pick<AutomationRunRecord, "id" | "slideshowId">>,
  records: PostFastPostRecord[]
) {
  return Object.fromEntries(
    runs.map((run) => [
      run.id,
      records
        .filter(
          (record) =>
            (record.sourceType === "automation" &&
              record.sourceId === run.id) ||
            (Boolean(run.slideshowId) &&
              record.sourceType === "slideshow" &&
              record.sourceId === run.slideshowId)
        )
        .reduce(
          (total, record) => total + postFastViewCount(record.analytics),
          0
        ),
    ])
  )
}

function canonicalViewsByRun(
  runs: Array<Pick<AutomationRunRecord, "id" | "slideshowId">>,
  posts: Post[],
  snapshots: Awaited<ReturnType<typeof listMetricSnapshots>>
) {
  const latestViewsByPost = new Map<
    string,
    { capturedAt: string; views: number }
  >()
  for (const snapshot of snapshots) {
    const current = latestViewsByPost.get(snapshot.postId)
    if (
      current &&
      Date.parse(current.capturedAt) >= Date.parse(snapshot.capturedAt)
    ) {
      continue
    }
    latestViewsByPost.set(snapshot.postId, {
      capturedAt: snapshot.capturedAt,
      views: snapshot.metrics.views ?? 0,
    })
  }
  return Object.fromEntries(
    runs.map((run) => [
      run.id,
      posts
        .filter((post) => postMatchesRun(post, run))
        .reduce(
          (total, post) => total + (latestViewsByPost.get(post.id)?.views ?? 0),
          0
        ),
    ])
  )
}

function postMatchesRun(
  post: Post,
  run: Pick<AutomationRunRecord, "id" | "slideshowId">
) {
  const sourceIds = new Set(
    [
      post.sourceId,
      post.runId,
      post.outputId,
      ...post.sourceRefs.map((ref) => ref.id),
    ].filter(Boolean)
  )
  return (
    sourceIds.has(run.id) ||
    (Boolean(run.slideshowId) && sourceIds.has(run.slideshowId))
  )
}

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
      caption: item.description,
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
