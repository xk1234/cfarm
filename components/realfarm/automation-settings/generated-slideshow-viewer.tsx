"use client"

import { useMemo, useState } from "react"

import {
  SlideshowViewerModal,
  type SlideshowViewerDetails,
  type SlideshowViewerImageOption,
  type SlideshowViewerItem,
  type SlideshowViewerMetadata,
  type SlideshowViewerSlide,
} from "@/components/realfarm/slideshow-viewer-modal"
import {
  automationRunSlides,
  canDeleteCompletedSlideshow,
  formatRunDate,
  formatRunSchedule,
  runPublishSchedule,
  slideshowCaption,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord, AutomationRunApiSlide } from "./types"
import { RunPublicationStatusSelect } from "./run-publication-status-select"
import { SlideshowPublicationActions } from "./slideshow-publication-actions"

export function GeneratedSlideshowViewerModal({
  run,
  runs,
  onDeleted,
  onRunChanged,
  allowDelete = true,
  details,
  onDebug,
  onDelete,
  onClose,
}: {
  run: AutomationRunApiRecord
  runs?: AutomationRunApiRecord[]
  onDeleted?: (runId: string) => void
  onRunChanged?: (run: AutomationRunApiRecord) => void
  allowDelete?: boolean
  details?: SlideshowViewerDetails
  onDebug?: () => void
  onDelete?: () => Promise<void>
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
  const resolvedDetails = details ?? viewerDetailsForRun(run)
  const currentRun = localRuns.find((item) => item.id === run.id) ?? run

  function applyRunChanged(updated: AutomationRunApiRecord) {
    setLocalRuns((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
    onRunChanged?.(updated)
  }

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

  async function loadSlideImages(slideshowItemId: string) {
    const target = localRuns.find((item) => item.id === slideshowItemId)
    if (!target?.slideshowId) {
      throw new Error("This slideshow has no editable record.")
    }
    const response = await fetch(
      `/api/slideshows/${encodeURIComponent(target.slideshowId)}`
    )
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      images?: SlideshowViewerImageOption[]
    }
    if (!response.ok) {
      throw new Error(payload.error || "Images could not be loaded.")
    }
    return payload.images ?? []
  }

  async function replaceSlideImage(
    slideshowItemId: string,
    slideIndex: number,
    imageUrl: string
  ) {
    const target = localRuns.find((item) => item.id === slideshowItemId)
    if (!target?.slideshowId) {
      throw new Error("This slideshow has no editable record.")
    }
    const response = await fetch(
      `/api/slideshows/${encodeURIComponent(target.slideshowId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replaceImage", slideIndex, imageUrl }),
      }
    )
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      run?: AutomationRunApiRecord
    }
    if (!response.ok || !payload.run) {
      throw new Error(payload.error || "The slide image could not be changed.")
    }
    setLocalRuns((current) =>
      current.map((item) => (item.id === payload.run!.id ? payload.run! : item))
    )
    onRunChanged?.(payload.run)
  }

  async function updateMetadata(
    slideshowItemId: string,
    metadata: SlideshowViewerMetadata
  ) {
    const target = localRuns.find((item) => item.id === slideshowItemId)
    if (!target?.slideshowId) {
      throw new Error("This slideshow has no editable record.")
    }
    const response = await fetch(
      `/api/slideshows/${encodeURIComponent(target.slideshowId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateMetadata", ...metadata }),
      }
    )
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      run?: AutomationRunApiRecord
    }
    if (!response.ok || !payload.run) {
      throw new Error(
        payload.error || "The slideshow details could not be saved."
      )
    }
    setLocalRuns((current) =>
      current.map((item) => (item.id === payload.run!.id ? payload.run! : item))
    )
    onRunChanged?.(payload.run)
  }

  async function deleteSlideshow() {
    if (onDelete) {
      await onDelete()
      return
    }
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
      details={resolvedDetails}
      publicationStatusControl={
        <div className="flex flex-wrap items-center gap-2">
          <RunPublicationStatusSelect
            run={currentRun}
            onRunChanged={applyRunChanged}
          />
          <SlideshowPublicationActions
            run={currentRun}
            onRunChanged={applyRunChanged}
          />
        </div>
      }
      onDebug={onDebug}
      onDelete={
        allowDelete && canDeleteCompletedSlideshow(run)
          ? deleteSlideshow
          : undefined
      }
      onDeleteSlide={deleteSlide}
      onLoadSlideImages={run.slideshowId ? loadSlideImages : undefined}
      onReplaceSlideImage={run.slideshowId ? replaceSlideImage : undefined}
      onUpdateMetadata={run.slideshowId ? updateMetadata : undefined}
      onClose={onClose}
    />
  )
}

function viewerDetailsForRun(
  run: AutomationRunApiRecord
): SlideshowViewerDetails {
  return {
    creationDate: formatRunDate(run.createdAt),
    postDate: formatRunSchedule(runPublishSchedule(run)),
    language: run.plan?.language || "English",
  }
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
  const rawImageUrl = slide.imageUrl?.trim() || slide.sourceImageUrl?.trim()
  const imageUrl = rawImageUrl
    ? cacheBustedImageUrl(rawImageUrl, run.updatedAt)
    : ""
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

function cacheBustedImageUrl(imageUrl: string, updatedAt?: string) {
  if (!updatedAt) return imageUrl
  const separator = imageUrl.includes("?") ? "&" : "?"
  return `${imageUrl}${separator}v=${encodeURIComponent(updatedAt)}`
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
