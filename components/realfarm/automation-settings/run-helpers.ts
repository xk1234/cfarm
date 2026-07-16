import {
  automationFormatSection,
  automationPublishType,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import { defaultAutomationLanguage } from "@/lib/slideshow-publishing-config"
import { slideshowStageForRunStatus } from "@/lib/slideshow-lifecycle"

import { formatCollectionImages } from "./format-helpers"
import type { AutomationRunApiRecord, AutomationRunApiSlide } from "./types"

export type AutomationRunSort = "Recent" | "Most viewed"

export function sortAutomationRuns(
  runs: AutomationRunApiRecord[],
  sort: AutomationRunSort
) {
  return [...runs].sort((first, second) => {
    const recentDifference = runTimestamp(second) - runTimestamp(first)
    if (sort === "Most viewed") {
      return (second.views ?? 0) - (first.views ?? 0) || recentDifference
    }
    return recentDifference
  })
}

function runTimestamp(run: AutomationRunApiRecord) {
  const timestamp = Date.parse(run.createdAt || run.scheduledFor)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function formatRunDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "Generated"
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function formatRunSchedule(value: string | undefined) {
  if (!value) {
    return "Not scheduled"
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "Not scheduled"
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function runPublishSchedule(run: AutomationRunApiRecord) {
  return run.generationSource === "manual" ? undefined : run.scheduledFor
}

export function runPublishedAt(run: AutomationRunApiRecord) {
  const actualPublishedAt = earliestValidDate(
    (run.socialStatuses ?? [])
      .filter((item) => item.status === "published")
      .map((item) => item.publishedAt)
  )
  if (actualPublishedAt) return actualPublishedAt

  if (validDate(run.manuallyPublishedAt)) return run.manuallyPublishedAt

  const scheduledAt = earliestValidDate(
    (run.socialStatuses ?? [])
      .filter((item) => item.status === "scheduled")
      .map((item) => item.scheduledAt)
  )
  if (scheduledAt) return scheduledAt

  return run.generationSource === "scheduled" && validDate(run.scheduledFor)
    ? run.scheduledFor
    : undefined
}

function earliestValidDate(values: Array<string | undefined>) {
  return values
    .flatMap((value) => (value && validDate(value) ? [value] : []))
    .sort((first, second) => Date.parse(first) - Date.parse(second))[0]
}

function validDate(value: string | undefined) {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}

export function runStatusLabel(
  status: AutomationRunApiRecord["status"],
  socialStatuses: AutomationRunApiRecord["socialStatuses"] = [],
  manuallyPublishedAt?: string
) {
  const stage = slideshowStageForRunStatus(status)
  if (stage === "generating") return "Generating"
  if (stage === "completed") {
    if (
      validDate(manuallyPublishedAt) ||
      socialStatuses.some((item) => item.status === "published")
    ) {
      return "Published"
    }
    if (socialStatuses.some((item) => item.status === "scheduled")) {
      return "Scheduled"
    }
    return "Not published"
  }
  return "Failed"
}

export function isCompletedSlideshowRun(run: AutomationRunApiRecord) {
  return slideshowStageForRunStatus(run.status) === "completed"
}

export function isSlideshowLifecycleRun(run: AutomationRunApiRecord) {
  return slideshowStageForRunStatus(run.status) !== null
}

export function isGeneratingSlideshowRun(run: AutomationRunApiRecord) {
  return slideshowStageForRunStatus(run.status) === "generating"
}

export function automationOverviewRunState(
  runs: AutomationRunApiRecord[],
  loading: boolean
) {
  if (runs.length > 0) return "runs" as const
  if (loading) return "loading" as const
  return "empty" as const
}

export function canDeleteCompletedSlideshow(run: AutomationRunApiRecord) {
  return Boolean(
    run.slideshowId &&
    isCompletedSlideshowRun(run) &&
    !validDate(run.manuallyPublishedAt) &&
    !(run.socialStatuses ?? []).some(
      (item) => item.status === "published" || item.status === "scheduled"
    )
  )
}

export function runDurationSeconds(run: AutomationRunApiRecord) {
  const slides = automationRunSlides(run)
  const durationMs = slides.reduce(
    (total, slide) => total + Math.max(0, slide.durationMs ?? 0),
    0
  )
  return durationMs > 0 ? durationMs / 1000 : slides.length * 4
}

export function formatRunDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`
}

export function runScheduleDurationLine(run: AutomationRunApiRecord) {
  const schedule = formatRunSchedule(runPublishSchedule(run))
  const exportsVideo =
    run.plan?.publishType === "video" || Boolean(run.videoUrl?.trim())
  return exportsVideo
    ? `${schedule} · ${formatRunDuration(runDurationSeconds(run))}`
    : schedule
}

export function slideshowTitle(run: AutomationRunApiRecord) {
  return (
    run.plan?.title?.trim() ||
    run.plan?.hook?.trim() ||
    automationRunSlides(run)[0]?.text?.trim() ||
    run.automationTitle
  )
}

export function slideshowCaption(run: AutomationRunApiRecord) {
  return (
    run.plan?.caption?.trim() ||
    run.plan?.hook?.trim().toLowerCase() ||
    automationRunSlides(run)[0]?.text?.trim().toLowerCase() ||
    "no caption saved."
  )
}

export function automationRunSlides(run: AutomationRunApiRecord) {
  return run.renderedSlides?.length
    ? run.renderedSlides
    : (run.plan?.slides ?? [])
}

export function exportableAutomationRunSlides(run: AutomationRunApiRecord) {
  return automationRunSlides(run).flatMap((slide) => {
    const imageUrl = slide.imageUrl?.trim() || slide.sourceImageUrl?.trim()
    return imageUrl ? [{ imageUrl }] : []
  })
}

export function generationPlaceholderRun({
  automation,
  config,
  requestId,
}: {
  automation: Automation
  config: AutomationSchema
  requestId?: string
}): AutomationRunApiRecord {
  const now = new Date().toISOString()
  const slides = generationPlaceholderSlides(config)

  return {
    id: `generation-placeholder-${automation.id}${requestId ? `-${requestId}` : ""}`,
    automationId: automation.id,
    automationTitle: automation.name,
    scheduledFor: now,
    generationSource: "manual",
    requestId,
    status: "running",
    progress: {
      stage: "Starting generation",
      updatedAt: now,
    },
    createdAt: now,
    socialStatuses: [],
    renderedSlides: slides,
    plan: {
      title: automation.name,
      caption: "",
      hashtags: "",
      hook: "",
      publishType: automationPublishType(config),
      language: config.language || defaultAutomationLanguage,
      slides,
    },
  }
}

export function reconcileGenerationPlaceholders({
  current,
  persisted,
  automationId,
  generating,
}: {
  current: AutomationRunApiRecord[]
  persisted: AutomationRunApiRecord[]
  automationId: string
  generating: boolean
}) {
  if (!generating) return persisted
  const persistedRequestIds = new Set(
    persisted.flatMap((run) => (run.requestId ? [run.requestId] : []))
  )
  const placeholders = current.filter((run) => {
    const isPlaceholder =
      run.id === `generation-placeholder-${automationId}` ||
      run.id.startsWith(`generation-placeholder-${automationId}-`)
    return (
      isPlaceholder &&
      (!run.requestId || !persistedRequestIds.has(run.requestId))
    )
  })
  return [
    ...placeholders,
    ...persisted.filter(
      (run) => !placeholders.some((placeholder) => placeholder.id === run.id)
    ),
  ].slice(0, 100)
}

export function automationGenerationIssue(
  config: AutomationSchema,
  collections: CreatedImageCollection[]
) {
  const hookImages = formatCollectionImages(config, collections, "hook")
  const contentImages = formatCollectionImages(config, collections, "content")
  if (hookImages.length === 0 && contentImages.length === 0) {
    return "Choose an image collection with at least one image before generating."
  }
  return undefined
}

export function generationPlaceholderSlides(
  config: AutomationSchema
): AutomationRunApiSlide[] {
  const hookSection = automationFormatSection(config, "hook")

  return [
    {
      id: "placeholder-generating",
      role: "hook",
      imageUrl: generatingSlidePlaceholderDataUrl(hookSection.aspect_ratio),
      imageCaption: "",
      text: "",
      durationMs: 0,
      aspectRatio: hookSection.aspect_ratio,
    },
  ]
}

export function generatingSlidePlaceholderDataUrl(aspectRatio?: string) {
  const [width, height] = placeholderDimensions(aspectRatio)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#000"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.075)}" font-weight="700">Generating...</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function placeholderDimensions(aspectRatio?: string): [number, number] {
  switch (aspectRatio) {
    case "4:5":
      return [1080, 1350]
    case "3:4":
      return [1080, 1440]
    case "3:2":
      return [1080, 720]
    case "1:1":
      return [1080, 1080]
    default:
      return [1080, 1920]
  }
}

export function ratioToCss(value: string | undefined) {
  switch (value) {
    case "4:5":
      return "4 / 5"
    case "3:4":
      return "3 / 4"
    case "3:2":
      return "3 / 2"
    case "1:1":
      return "1 / 1"
    case "9:16":
    default:
      return "9 / 16"
  }
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function cloneAutomationSchema(
  config: AutomationSchema
): AutomationSchema {
  return structuredClone(config)
}
