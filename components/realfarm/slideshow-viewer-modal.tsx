"use client"

import { useState } from "react"
import { IconX } from "@tabler/icons-react"

import { TemplateGeneratedPreview } from "@/components/realfarm/template-showcase-preview"
import { CheckedDropdownButton } from "@/components/ui/form-controls"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { cn } from "@/lib/utils"

export type SlideshowViewerSlide = {
  id: string
  imageUrl: string
  text: string
  section: "hook" | "content" | "cta"
  durationSeconds?: number
}

export type SlideshowViewerItem = {
  id: string
  label: string
  title: string
  slides: SlideshowViewerSlide[]
}

export function SlideshowViewerModal({
  title,
  slideshows,
  initialSlideshowId,
  fallbackSlides = [],
  onClose,
}: {
  title: string
  slideshows: SlideshowViewerItem[]
  initialSlideshowId?: string
  fallbackSlides?: SlideshowViewerSlide[]
  onClose: () => void
}) {
  const initialIndex = Math.max(
    0,
    slideshows.findIndex((slideshow) => slideshow.id === initialSlideshowId)
  )
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const boundedIndex =
    slideshows.length > 0 ? Math.min(selectedIndex, slideshows.length - 1) : 0
  const selectedSlideshow = slideshows[boundedIndex]

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="h-[min(620px,90vh)] max-w-[760px] rounded-[10px] bg-[#b9b9b6]">
        <SlideshowViewerContent
          key={selectedSlideshow?.id ?? "empty"}
          title={title}
          slideshows={slideshows}
          selectedIndex={boundedIndex}
          onSelectSlideshow={setSelectedIndex}
          slides={selectedSlideshow?.slides ?? []}
          fallbackSlides={fallbackSlides}
          onClose={onClose}
        />
      </AppModalPanel>
    </AppModal>
  )
}

function SlideshowViewerContent({
  title,
  slideshows,
  selectedIndex,
  onSelectSlideshow,
  slides,
  fallbackSlides,
  onClose,
}: {
  title: string
  slideshows: SlideshowViewerItem[]
  selectedIndex: number
  onSelectSlideshow: (index: number) => void
  slides: SlideshowViewerSlide[]
  fallbackSlides: SlideshowViewerSlide[]
  onClose: () => void
}) {
  const [activeSlide, setActiveSlide] = useState(0)
  const boundedActiveSlide =
    slides.length > 0 ? Math.min(activeSlide, slides.length - 1) : 0
  const visibleSlots = [
    boundedActiveSlide - 1,
    boundedActiveSlide,
    boundedActiveSlide + 1,
  ]
  const slideshowOptions =
    slideshows.length > 0
      ? slideshows.map((slideshow, index) => slideshow.label || `Slideshow ${index + 1}`)
      : ["No example"]
  const selectedSlideshowLabel =
    slideshows.length > 0
      ? slideshowOptions[selectedIndex] ?? slideshowOptions[0]
      : slideshowOptions[0]

  return (
    <>
      <header className="flex h-[60px] items-center justify-between border-b border-[#d7d6d0] bg-white px-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
            onClick={onClose}
            aria-label="Close slideshow"
          >
            <IconX className="size-5" />
          </button>
          <h2 className="min-w-0 truncate text-[18px] font-semibold text-[#242421]">
            {title}
          </h2>
        </div>
        <CheckedDropdownButton
          value={selectedSlideshowLabel}
          options={slideshowOptions}
          className="min-w-[124px]"
          onChange={(value) => {
            const nextIndex = slideshowOptions.indexOf(value)
            if (nextIndex >= 0 && nextIndex < slideshows.length) {
              onSelectSlideshow(nextIndex)
            }
          }}
        />
      </header>
      <main className="relative flex h-[calc(100%-60px)] items-center justify-center overflow-hidden px-4">
        {slides.length === 0 ? (
          <TemplateGeneratedPreview
            exampleSlides={fallbackSlides}
            tileCount={3}
            className="h-[356px] w-[620px] max-w-full rounded-[9px] shadow-xl"
          />
        ) : (
          <div className="flex max-w-full items-center gap-4 overflow-hidden">
            {visibleSlots.map((absoluteIndex, index) => {
              const slide = slides[absoluteIndex]
              if (!slide) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="h-[356px] w-[200px] shrink-0"
                    aria-hidden="true"
                  />
                )
              }
              return (
                <button
                  key={slide.id}
                  type="button"
                  className={cn(
                    "relative h-[356px] w-[200px] shrink-0 cursor-pointer overflow-hidden rounded-[9px] bg-black text-left shadow-xl transition duration-300",
                    absoluteIndex === boundedActiveSlide
                      ? "opacity-100 ring-2 ring-white"
                      : "opacity-45"
                  )}
                  onClick={() => setActiveSlide(absoluteIndex)}
                  aria-label={`Show slide ${absoluteIndex + 1}`}
                >
                  <img
                    src={slide.imageUrl}
                    alt={slide.text || `${title} slide ${absoluteIndex + 1}`}
                    className="h-full w-full bg-black object-contain"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-black/20" />
                  {slide.text && slide.section !== "hook" ? (
                    <div className="absolute inset-x-8 top-[45%] text-center font-tiktok text-[15px] leading-tight font-bold text-yellow-100 drop-shadow">
                      {slide.text}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
        {slides.length > 0 ? (
          <div className="absolute bottom-[32px] flex gap-2">
            {slides.map((_, dot) => (
              <button
                key={dot}
                type="button"
                className={cn(
                  "size-2 rounded-full",
                  dot === boundedActiveSlide ? "bg-white" : "bg-white/55"
                )}
                onClick={() => setActiveSlide(dot)}
                aria-label={`Show slide ${dot + 1}`}
              />
            ))}
          </div>
        ) : null}
      </main>
    </>
  )
}
