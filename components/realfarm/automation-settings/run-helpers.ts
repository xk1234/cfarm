import {
  automationFormatSection,
  automationHooks,
  automationPublishType,
  type AutomationFormatSection,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { defaultAutomationLanguage } from "@/lib/slideshow-publishing-config"

import { formatCollectionImages, formatPreviewText } from "./format-helpers"
import type { AutomationRunApiRecord, AutomationRunApiSlide } from "./types"

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
  collections,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
}): AutomationRunApiRecord {
  const now = new Date().toISOString()
  const hook = automationHooks(config)[0] || config.title || automation.name
  const slides = generationPlaceholderSlides(config, collections, hook)

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
      title: "Generating slideshow",
      caption: "",
      hashtags: "",
      hook,
      publishType: automationPublishType(config),
      language:
        config.image_collection_ids.language || defaultAutomationLanguage,
      slides,
    },
  }
}

export function generationPlaceholderSlides(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  hook: string
): AutomationRunApiSlide[] {
  const hookSection = automationFormatSection(config, "hook")
  const contentSection = automationFormatSection(config, "content")
  const hookImages = formatCollectionImages(config, collections, "hook")
  const contentImages = formatCollectionImages(config, collections, "content")
  const slides = [
    generationPlaceholderSlide({
      id: "placeholder-hook",
      role: "hook",
      image: hookImages[0] ?? contentImages[0],
      text: hook,
      section: hookSection,
    }),
    ...[0, 1].map((index) =>
      generationPlaceholderSlide({
        id: `placeholder-content-${index + 1}`,
        role: "content",
        image:
          contentImages[index % Math.max(1, contentImages.length)] ??
          hookImages[0],
        text: formatPreviewText(config, "content", index),
        section: contentSection,
      })
    ),
  ]

  return slides.filter((slide): slide is AutomationRunApiSlide =>
    Boolean(slide)
  )
}

export function generationPlaceholderSlide({
  id,
  role,
  image,
  text,
  section,
}: {
  id: string
  role: "hook" | "content"
  image: PinterestSearchResult | undefined
  text: string
  section: AutomationFormatSection
}): AutomationRunApiSlide | null {
  if (!image?.imageUrl) {
    return null
  }

  return {
    id,
    role,
    imageUrl: image.imageUrl,
    sourceImageUrl: image.sourceUrl,
    imageCaption: image.description ?? image.title ?? "",
    text,
    durationMs: 0,
    aspectRatio: section.aspect_ratio,
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

export function cloneAutomationSchema(config: AutomationSchema): AutomationSchema {
  return structuredClone(config)
}


