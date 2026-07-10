"use client"

import { useMemo } from "react"

import {
  generatedExampleSlides,
  generatedExampleSlideshows,
  type GeneratedShowcaseRun,
} from "@/components/realfarm/template-showcase-preview"

import { SlideshowViewerModal } from "./slideshow-viewer-modal"

export function ExampleSlideshowModal({
  title,
  runs,
  initialSlideshowId,
  onClose,
}: {
  title: string
  runs: GeneratedShowcaseRun[] | undefined
  initialSlideshowId?: string
  onClose: () => void
}) {
  const slideshows = useMemo(() => generatedExampleSlideshows(runs), [runs])
  const fallbackSlides = useMemo(() => generatedExampleSlides(runs, 3), [runs])

  return (
    <SlideshowViewerModal
      title={title}
      slideshows={slideshows}
      initialSlideshowId={initialSlideshowId}
      fallbackSlides={fallbackSlides}
      onClose={onClose}
    />
  )
}
