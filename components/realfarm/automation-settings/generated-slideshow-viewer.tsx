"use client"

import { useMemo } from "react"

import {
  SlideshowViewerModal,
  type SlideshowViewerItem,
  type SlideshowViewerSlide,
} from "@/components/realfarm/slideshow-viewer-modal"

import {
  automationRunSlides,
  formatRunDate,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord, AutomationRunApiSlide } from "./types"

export function GeneratedSlideshowViewerModal({
  run,
  runs,
  onClose,
}: {
  run: AutomationRunApiRecord
  runs?: AutomationRunApiRecord[]
  onClose: () => void
}) {
  const slideshows = useMemo(
    () => automationRunsToViewerSlideshows(runs?.length ? runs : [run]),
    [run, runs]
  )

  return (
    <SlideshowViewerModal
      title={run.automationTitle || slideshowTitle(run)}
      slideshows={slideshows}
      initialSlideshowId={run.id}
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
        label: formatRunDate(run.createdAt || run.scheduledFor) || `Slideshow ${runIndex + 1}`,
        title: slideshowTitle(run) || run.automationTitle || `Slideshow ${runIndex + 1}`,
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
      typeof slide.durationMs === "number" ? Math.max(1, slide.durationMs / 1000) : undefined,
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
