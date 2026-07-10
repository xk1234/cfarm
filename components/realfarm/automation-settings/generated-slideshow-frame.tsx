"use client"

import { useState, type ReactNode } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { AutomationThumb } from "@/components/realfarm/shared-media"
import { cn } from "@/lib/utils"

import { ratioToCss } from "./run-helpers"

export type GeneratedSlideshowFrameSlide = {
  id?: string
  imageUrl?: string
  imageCaption?: string
  text?: string
  aspectRatio?: string
}

export function GeneratedSlideshowFrame({
  slides,
  statusLabel,
  statusClassName,
  footerText,
  fallbackTheme = "blue",
  fallbackIndex = 0,
  renderOverlay,
  onSlideChange,
}: {
  slides: GeneratedSlideshowFrameSlide[]
  statusLabel?: string
  statusClassName?: string
  footerText?: string
  fallbackTheme?: string
  fallbackIndex?: number
  renderOverlay?: (input: {
    slide: GeneratedSlideshowFrameSlide
    index: number
  }) => ReactNode
  onSlideChange?: (input: {
    slide: GeneratedSlideshowFrameSlide | undefined
    index: number
  }) => void
}) {
  const [activeSlide, setActiveSlide] = useState(0)
  const activeSlideIndex = Math.min(activeSlide, Math.max(0, slides.length - 1))
  const activeSlideRecord = slides[activeSlideIndex] ?? slides[0]
  const canGoPrev = activeSlideIndex > 0
  const canGoNext = activeSlideIndex < slides.length - 1

  function setActiveSlideIndex(index: number) {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index))
    setActiveSlide(nextIndex)
    onSlideChange?.({
      slide: slides[nextIndex],
      index: nextIndex,
    })
  }

  return (
    <div className="relative grid h-[498px] w-full place-items-center overflow-hidden rounded-[9px] bg-black shadow-xl">
      <div
        className="relative grid h-full max-h-full w-full max-w-full place-items-center overflow-hidden bg-black"
        style={{
          aspectRatio: ratioToCss(activeSlideRecord?.aspectRatio),
        }}
      >
        {activeSlideRecord?.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- Slideshow previews render generated/local asset URLs directly. */
          <img
            src={activeSlideRecord.imageUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <AutomationThumb theme={fallbackTheme} index={fallbackIndex} />
        )}
        {activeSlideRecord && renderOverlay
          ? renderOverlay({
              slide: activeSlideRecord,
              index: activeSlideIndex,
            })
          : null}
      </div>
      {statusLabel ? (
        <span
          className={cn(
            "absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm",
            statusClassName
          )}
        >
          {statusLabel}
        </span>
      ) : null}
      {slides.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute top-1/2 left-2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/88 text-[#242421] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => setActiveSlideIndex(activeSlideIndex - 1)}
            disabled={!canGoPrev}
            aria-label="Previous slide"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            className="absolute top-1/2 right-2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/88 text-[#242421] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => setActiveSlideIndex(activeSlideIndex + 1)}
            disabled={!canGoNext}
            aria-label="Next slide"
          >
            <IconChevronRight className="size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pt-8 pb-2 text-center text-[12px] font-bold text-white">
            {footerText || `Slide ${activeSlideIndex + 1} of ${slides.length}`}
          </div>
        </>
      ) : null}
    </div>
  )
}
