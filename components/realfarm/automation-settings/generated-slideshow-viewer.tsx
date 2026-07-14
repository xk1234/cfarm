"use client"

import { useMemo, useState } from "react"

import {
  SlideshowViewerModal,
  type SlideshowViewerItem,
  type SlideshowViewerSlide,
} from "@/components/realfarm/slideshow-viewer-modal"

import {
  automationRunSlides,
  canDeleteCompletedSlideshow,
  formatRunDate,
  slideshowCaption,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord, AutomationRunApiSlide } from "./types"

export function GeneratedSlideshowViewerModal({
  run,
  runs,
  onDeleted,
  onRunChanged,
  onClose,
}: {
  run: AutomationRunApiRecord
  runs?: AutomationRunApiRecord[]
  onDeleted?: (runId: string) => void
  onRunChanged?: (run: AutomationRunApiRecord) => void
  onClose: () => void
}) {
  // Local copy so slide deletions reflect immediately even when the parent
  // does not re-render its runs prop.
  const [localRuns, setLocalRuns] = useState<AutomationRunApiRecord[]>(() =>
    runs?.length ? runs : [run]
  )
  const slideshows = useMemo(
    () => automationRunsToViewerSlideshows(localRuns),
    [localRuns]
  )

  async function deleteSlide(slideshowItemId: string, slideIndex: number) {
    const target = localRuns.find((item) => item.id === slideshowItemId)
    if (!target?.slideshowId) {
      throw new Error("This slideshow has no editable record.")
    }
    const response = await fetch(
      `/api/slideshows/${encodeURIComponent(target.slideshowId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeSlide", slideIndex }),
      }
    )
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      run?: AutomationRunApiRecord
    }
    if (!response.ok) {
      throw new Error(payload.error || "The slide could not be deleted.")
    }
    const dropSlide = <T,>(items: T[] | undefined) =>
      items?.filter((_, index) => index !== slideIndex)
    const updated: AutomationRunApiRecord = payload.run ?? {
      ...target,
      renderedSlides: dropSlide(target.renderedSlides),
      outputImages: dropSlide(target.outputImages),
      plan: target.plan
        ? { ...target.plan, slides: dropSlide(target.plan.slides) }
        : target.plan,
    }
    setLocalRuns((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
    onRunChanged?.(updated)
  }

  async function deleteSlideshow() {
    if (!run.slideshowId) return
    const response = await fetch(
      `/api/slideshows/${encodeURIComponent(run.slideshowId)}`,
      { method: "DELETE" }
    )
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || "The slideshow could not be deleted.")
    }
    onDeleted?.(run.id)
    onClose()
  }

  return (
    <SlideshowViewerModal
      title={run.automationTitle || slideshowTitle(run)}
      slideshows={slideshows}
      initialSlideshowId={run.id}
      benchmarkSlideshowId={run.slideshowId}
      onDelete={canDeleteCompletedSlideshow(run) ? deleteSlideshow : undefined}
      onDeleteSlide={deleteSlide}
      onClose={onClose}
    />
  )
}

function automationRunsToViewerSlideshows(runs: AutomationRunApiRecord[]) {
  return runs
    .map<SlideshowViewerItem | null>((run, runIndex) => {
      const slides = automationRunSlides(run)
        .map<SlideshowViewerSlide | null>((slide, slideIndex) =>
          automationSlideToViewerSlide(run, slide, slideIndex)
        )
        .filter((slide): slide is SlideshowViewerSlide => Boolean(slide))

      if (slides.length === 0) {
        return null
      }

      return {
        id: run.id,
        label:
          formatRunDate(run.createdAt || run.scheduledFor) ||
          `Slideshow ${runIndex + 1}`,
        title:
          slideshowTitle(run) ||
          run.automationTitle ||
          `Slideshow ${runIndex + 1}`,
        caption: slideshowCaption(run),
        hashtags: run.plan?.hashtags,
        slides,
      }
    })
    .filter((slideshow): slideshow is SlideshowViewerItem => Boolean(slideshow))
}

function automationSlideToViewerSlide(
  run: AutomationRunApiRecord,
  slide: AutomationRunApiSlide,
  index: number
): SlideshowViewerSlide | null {
  const imageUrl = slide.imageUrl?.trim() || slide.sourceImageUrl?.trim()
  if (!imageUrl) {
    return null
  }

  return {
    id: `${run.id}-${slide.id ?? index}`,
    imageUrl,
    text: slide.text?.trim() || slide.imageCaption?.trim() || "",
    section: automationSlideSection(slide, index),
    durationSeconds:
      typeof slide.durationMs === "number"
        ? Math.max(1, slide.durationMs / 1000)
        : undefined,
  }
}

function automationSlideSection(
  slide: AutomationRunApiSlide,
  index: number
): SlideshowViewerSlide["section"] {
  if (slide.role === "hook" || slide.role === "cta") {
    return slide.role
  }
  return index === 0 ? "hook" : "content"
}
