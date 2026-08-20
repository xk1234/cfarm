import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { slideshowDeliveryLinks } from "@/lib/asset-urls"
import { getCurrentUser } from "@/lib/auth"
import { automationRunProgress } from "@/lib/automation-run-progress"
import type { AutomationRunSlideView } from "@/lib/automation-run-contract"
import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import {
  listGeneratedVideoExports,
  type GeneratedVideoExport,
} from "@/lib/generated-videos"
import { listPublicationRecordsForRead } from "@/lib/post-repository"

export const dynamic = "force-dynamic"
const maximumRunLimit = 100

type AutomationRunResponse = (
  AutomationRunRecord | NonNullable<ReturnType<typeof generatedVideoRun>>
) & {
  progress?: ReturnType<typeof automationRunProgress>
}

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const automationId = searchParams.get("templateId")?.trim()
  const runId = searchParams.get("runId")?.trim()
  const summaryView = searchParams.get("view") === "summary"
  const user = summaryView ? null : await getCurrentUser()
  const limitValue = Number(searchParams.get("limit"))
  const limit =
    Number.isFinite(limitValue) && limitValue > 0
      ? Math.min(Math.floor(limitValue), maximumRunLimit)
      : 20
  const postRecordsPromise = listPublicationRecordsForRead({
    surface: "automation_runs_publications",
  }).catch(() => [])
  const [automationRuns, videoExports] = await Promise.all([
    listAutomationRuns({
      automationId: automationId || undefined,
      runId: runId || undefined,
      limit,
      postRecords: postRecordsPromise,
    }),
    listGeneratedVideoExports({
      id: runId || undefined,
      automationId: automationId || undefined,
    }),
  ])
  const videoRuns = videoExports.flatMap((item) => {
    const run = generatedVideoRun(item)
    return run ? [run] : []
  })
  const runs = [...automationRuns, ...videoRuns]
    .filter((run) => !runId || run.id === runId || run.slideshowId === runId)
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime()
    )
    .slice(0, limit)
  const responseRuns = runs.map((run) => ({
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
  }))

  return NextResponse.json({
    runs: summaryView ? responseRuns.map(automationRunSummary) : responseRuns,
  })
})

function automationRunSummary(run: AutomationRunResponse) {
  const persistedRun = "scheduledFor" in run ? run : undefined
  const plan = run.plan as Partial<AutomationRunRecord["plan"]>
  const previewSlide = persistedRun?.renderedSlides?.[0] ?? plan.slides?.[0]

  return {
    id: run.id,
    automationId: run.automationId,
    automationTitle: run.automationTitle,
    ...(persistedRun?.scheduledFor
      ? { scheduledFor: persistedRun.scheduledFor }
      : {}),
    ...(persistedRun?.generationSource
      ? { generationSource: persistedRun.generationSource }
      : {}),
    ...(persistedRun?.requestId ? { requestId: persistedRun.requestId } : {}),
    status: run.status,
    ...(run.progress ? { progress: run.progress } : {}),
    slideshowId: run.slideshowId,
    ...(persistedRun?.socialStatuses
      ? { socialStatuses: persistedRun.socialStatuses }
      : {}),
    ...(persistedRun?.manuallyPublishedAt
      ? { manuallyPublishedAt: persistedRun.manuallyPublishedAt }
      : {}),
    createdAt: run.createdAt,
    ...(persistedRun?.updatedAt ? { updatedAt: persistedRun.updatedAt } : {}),
    error: run.error,
    videoUrl: run.videoUrl,
    thumbnailUrl: run.thumbnailUrl,
    durationSeconds: automationRunDurationSeconds(persistedRun, plan),
    ...(previewSlide
      ? { renderedSlides: [runSummarySlide(previewSlide)] }
      : {}),
    plan: {
      title: plan.title,
      hook: plan.hook,
      publishType: plan.publishType,
      language: plan.language,
    },
  }
}

function automationRunDurationSeconds(
  run: AutomationRunRecord | undefined,
  plan: Partial<AutomationRunRecord["plan"]>
) {
  const slides = run?.renderedSlides?.length
    ? run.renderedSlides
    : (plan.slides ?? [])
  const durationMs = slides.reduce(
    (total, slide) => total + Math.max(0, slide.durationMs ?? 0),
    0
  )
  return durationMs > 0 ? durationMs / 1000 : slides.length * 4
}

function runSummarySlide(slide: AutomationRunSlideView) {
  return {
    id: slide.id,
    role: slide.role,
    imageUrl: slide.imageUrl,
    sourceImageUrl: slide.sourceImageUrl,
    text: slide.text,
    imageCaption: slide.imageCaption,
    durationMs: slide.durationMs,
    aspectRatio: slide.aspectRatio,
  }
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
