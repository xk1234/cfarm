"use client"

import { useMemo } from "react"

import {
  generatedExampleSlides,
  generatedExampleSlideshows,
  type GeneratedShowcaseRun,
} from "@/components/realfarm/template-showcase-preview"

import { SlideshowViewerModal } from "./slideshow-viewer-modal"
import { slideshowStageForRunStatus } from "@/lib/slideshow-lifecycle"

export function ExampleSlideshowModal({
  title,
  runs,
  initialSlideshowId,
  onDeleted,
  onClose,
}: {
  title: string
  runs: GeneratedShowcaseRun[] | undefined
  initialSlideshowId?: string
  onDeleted?: (runId: string) => void
  onClose: () => void
}) {
  const slideshows = useMemo(() => generatedExampleSlideshows(runs), [runs])
  const fallbackSlides = useMemo(() => generatedExampleSlides(runs, 3), [runs])
  const selectedRun = runs?.find((run) => run.id === initialSlideshowId)
  const canDelete = Boolean(
    selectedRun?.slideshowId &&
    slideshowStageForRunStatus(selectedRun.status) === "completed" &&
    !selectedRun.socialStatuses?.some(
      (item) => item.status === "published" || item.status === "scheduled"
    )
  )

  async function deleteSlideshow() {
    if (!selectedRun?.slideshowId) return
    const response = await fetch(
      `/api/slideshows/${encodeURIComponent(selectedRun.slideshowId)}`,
      { method: "DELETE" }
    )
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || "The slideshow could not be deleted.")
    }
    onDeleted?.(selectedRun.id)
    onClose()
  }

  return (
    <SlideshowViewerModal
      title={title}
      slideshows={slideshows}
      initialSlideshowId={initialSlideshowId}
      fallbackSlides={fallbackSlides}
      onDelete={canDelete ? deleteSlideshow : undefined}
      onClose={onClose}
    />
  )
}
