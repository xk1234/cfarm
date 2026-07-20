import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { automationRunProgress } from "@/lib/automation-run-progress"
import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { listAutomationRecords } from "@/lib/automations"
import {
  listGeneratedVideoExports,
  type GeneratedVideoExport,
} from "@/lib/generated-videos"
import { isRecord } from "@/lib/guards"
import {
  listPostFastPostRecords,
  type PostFastAnalyticsMetric,
} from "@/lib/postfast-posts"
import { listJobs, type Job } from "@/lib/queue"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const automationId = searchParams.get("automationId")?.trim()
  const limitValue = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 20
  const postRecordsPromise = listPostFastPostRecords().catch(() => [])
  const [automationRuns, videoExports, postRecords, generationJobs] =
    await Promise.all([
      listAutomationRuns({
        automationId: automationId || undefined,
        limit,
        postRecords: postRecordsPromise,
      }),
      listGeneratedVideoExports({
        automationId: automationId || undefined,
      }),
      postRecordsPromise,
      listJobs({
        type: "run-automation",
        limit: Math.min(500, Math.max(100, limit * 5)),
      }).catch(() => []),
    ])
  const failedJobs = generationJobs.filter(isFailedGenerationJob)
  const automationTitles =
    failedJobs.length > 0
      ? new Map(
          (await listAutomationRecords().catch(() => [])).map((automation) => [
            automation.id,
            automation.name,
          ])
        )
      : new Map<string, string>()
  const videoRuns = videoExports.flatMap((item) => {
    const run = generatedVideoRun(item)
    return run ? [run] : []
  })
  const failedJobRuns = failedGenerationJobRuns({
    jobs: failedJobs,
    persistedRuns: automationRuns,
    automationTitles,
    automationId: automationId || undefined,
  })
  const runs = [...automationRuns, ...videoRuns, ...failedJobRuns]
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

export function failedGenerationJobRuns({
  jobs,
  persistedRuns,
  automationTitles,
  automationId: requestedAutomationId,
}: {
  jobs: Job[]
  persistedRuns: AutomationRunRecord[]
  automationTitles: Map<string, string>
  automationId?: string
}) {
  const persistedIds = new Set(persistedRuns.map((run) => run.id))
  const persistedRequestIds = new Set(
    persistedRuns.flatMap((run) => (run.requestId ? [run.requestId] : []))
  )
  const persistedSlots = new Set(
    persistedRuns.map((run) => `${run.automationId}:${run.scheduledFor}`)
  )

  return jobs.flatMap((job) => {
    if (!isFailedGenerationJob(job)) return []
    const payload = isRecord(job.payload) ? job.payload : {}
    const result = isRecord(job.result) ? job.result : {}
    const automationId = stringValue(payload.automationId)
    if (
      !automationId ||
      (requestedAutomationId && automationId !== requestedAutomationId)
    ) {
      return []
    }
    const scheduledFor =
      stringValue(payload.scheduledFor) ||
      job.availableAt ||
      job.createdAt ||
      job.updatedAt
    if (!scheduledFor) return []

    const materializedRunId = stringValue(result.runId)
    const requestId = stringValue(payload.requestId)
    if (
      (materializedRunId && persistedIds.has(materializedRunId)) ||
      (requestId && persistedRequestIds.has(requestId)) ||
      persistedSlots.has(`${automationId}:${scheduledFor}`)
    ) {
      return []
    }

    const createdAt = job.createdAt || job.updatedAt || scheduledFor
    const automationTitle =
      automationTitles.get(automationId) || "Automation generation"
    return [
      {
        id: `job:${job.id}`,
        automationId,
        automationTitle,
        scheduledFor,
        generationSource: "scheduled" as const,
        requestId,
        status: "failed" as const,
        slideshowId: undefined,
        createdAt,
        updatedAt: job.updatedAt || createdAt,
        error:
          job.error ||
          "Generation failed before an output record could be created.",
        plan: {
          title: automationTitle,
          caption: "",
          hashtags: "",
          hook: "",
          imageCollectionIds: [],
          slides: [],
          slideCount: { mode: "fixed", count: 0 },
          publishType: "slideshow",
          autoMusic: false,
          autoPost: false,
          language: "en",
        },
      },
    ]
  })
}

function isFailedGenerationJob(job: Job) {
  return (
    job.type === "run-automation" &&
    (job.status === "failed" || job.status === "dead")
  )
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
