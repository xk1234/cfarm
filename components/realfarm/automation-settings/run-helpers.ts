import {
  automationFormatSection,
  automationPublishType,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import { defaultAutomationLanguage } from "@/lib/slideshow-publishing-config"

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

export function runStatusLabel(status: AutomationRunApiRecord["status"]) {
  switch (status) {
    case "generating":
      return "Generating"
    case "succeeded":
      return "Succeeded"
    case "failed":
      return "Failed"
    default:
      return "Succeeded"
  }
}

export function runStatusBadgeClass(status: AutomationRunApiRecord["status"]) {
  switch (status) {
    case "generating":
      return "bg-[#ff4d2d] text-white"
    case "succeeded":
      return "bg-emerald-600 text-white"
    case "failed":
      return "bg-[#d94444] text-white"
    default:
      return "bg-white/90 text-[#242421]"
  }
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
  return `${formatRunSchedule(run.scheduledFor)} · ${formatRunDuration(
    runDurationSeconds(run)
  )}`
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

export function generationPlaceholderRun({
  automation,
  config,
}: {
  automation: Automation
  config: AutomationSchema
}): AutomationRunApiRecord {
  const now = new Date().toISOString()
  const slides = generationPlaceholderSlides(config)

  return {
    id: `generation-placeholder-${automation.id}`,
    automationId: automation.id,
    automationTitle: automation.name,
    scheduledFor: now,
    status: "generating",
    createdAt: now,
    socialStatuses: [],
    renderedSlides: slides,
    plan: {
      title: automation.name,
      caption: "",
      hashtags: "",
      hook: "",
      publishType: automationPublishType(config),
      language:
        config.image_collection_ids.language || defaultAutomationLanguage,
      slides,
    },
  }
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

  return [{
    id: "placeholder-generating",
    role: "hook",
    imageUrl: generatingSlidePlaceholderDataUrl(hookSection.aspect_ratio),
    imageCaption: "",
    text: "",
    durationMs: 0,
    aspectRatio: hookSection.aspect_ratio,
  }]
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
