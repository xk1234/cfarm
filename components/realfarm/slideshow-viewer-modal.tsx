"use client"

import { useState } from "react"
import { IconChartBar, IconDownload, IconX } from "@tabler/icons-react"

import { BenchmarkComparisonModal } from "@/components/realfarm/benchmark-comparison-modal"
import { TemplateGeneratedPreview } from "@/components/realfarm/template-showcase-preview"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { exportSlideshowAsPngZip } from "@/lib/slideshow-export"
import { cn } from "@/lib/utils"
import type { SlideshowBenchmarkComparison } from "@/lib/slideshow-benchmarks"

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
  benchmarkSlideshowId,
  fallbackSlides = [],
  onClose,
}: {
  title: string
  slideshows: SlideshowViewerItem[]
  initialSlideshowId?: string
  benchmarkSlideshowId?: string
  fallbackSlides?: SlideshowViewerSlide[]
  onClose: () => void
}) {
  const initialIndex = Math.max(
    0,
    slideshows.findIndex((slideshow) => slideshow.id === initialSlideshowId)
  )
  const boundedIndex =
    slideshows.length > 0 ? Math.min(initialIndex, slideshows.length - 1) : 0
  const selectedSlideshow = slideshows[boundedIndex]

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="h-[min(620px,90vh)] max-w-[760px] rounded-[10px] bg-[#b9b9b6]">
        <SlideshowViewerContent
          key={selectedSlideshow?.id ?? "empty"}
          title={title}
          exportTitle={selectedSlideshow?.title || title}
          slides={selectedSlideshow?.slides ?? []}
          fallbackSlides={fallbackSlides}
          benchmarkSlideshowId={benchmarkSlideshowId}
          onClose={onClose}
        />
      </AppModalPanel>
    </AppModal>
  )
}

function SlideshowViewerContent({
  title,
  exportTitle,
  slides,
  fallbackSlides,
  benchmarkSlideshowId,
  onClose,
}: {
  title: string
  exportTitle: string
  slides: SlideshowViewerSlide[]
  fallbackSlides: SlideshowViewerSlide[]
  benchmarkSlideshowId?: string
  onClose: () => void
}) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [benchmark, setBenchmark] =
    useState<SlideshowBenchmarkComparison | null>(null)
  const [benchmarkOpen, setBenchmarkOpen] = useState(false)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [benchmarkError, setBenchmarkError] = useState("")
  const boundedActiveSlide =
    slides.length > 0 ? Math.min(activeSlide, slides.length - 1) : 0
  const visibleSlots = [
    boundedActiveSlide - 1,
    boundedActiveSlide,
    boundedActiveSlide + 1,
  ]

  async function exportSlides() {
    setExporting(true)
    setExportError("")
    try {
      await exportSlideshowAsPngZip({ title: exportTitle, slides })
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "The slideshow could not be exported."
      )
    } finally {
      setExporting(false)
    }
  }

  async function openBenchmark() {
    if (!benchmarkSlideshowId) return
    setBenchmarkOpen(true)
    if (benchmark) return
    setBenchmarkLoading(true)
    setBenchmarkError("")
    try {
      const response = await fetch(
        `/api/benchmarks?slideshowId=${encodeURIComponent(benchmarkSlideshowId)}`
      )
      const payload = (await response.json()) as {
        comparison?: SlideshowBenchmarkComparison | null
        error?: string
      }
      if (!response.ok || !payload.comparison) {
        throw new Error(payload.error || "No benchmark is available for this slideshow.")
      }
      setBenchmark(payload.comparison)
    } catch (error) {
      setBenchmarkError(
        error instanceof Error ? error.message : "Benchmark could not be loaded."
      )
    } finally {
      setBenchmarkLoading(false)
    }
  }

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
        <div className="flex items-center gap-3">
          {exportError ? (
            <span className="max-w-[280px] truncate text-[12px] font-semibold text-[#b33a3a]">
              {exportError}
            </span>
          ) : null}
          {benchmarkSlideshowId ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#d8d7cf] bg-white px-3.5 text-[13px] font-semibold text-[#242421] shadow-sm transition hover:bg-[#f4f3ee]"
              onClick={() => void openBenchmark()}
            >
              <IconChartBar className="size-4" />
              Benchmark
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-app-action px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={exporting || slides.length === 0}
            onClick={() => void exportSlides()}
          >
            <IconDownload className="size-4" />
            {exporting ? "Exporting…" : "Export PNGs"}
          </button>
        </div>
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
      {benchmarkOpen && benchmark ? (
        <BenchmarkComparisonModal
          comparison={benchmark}
          onClose={() => setBenchmarkOpen(false)}
        />
      ) : null}
      {benchmarkOpen && !benchmark ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-[10px] bg-white p-6 text-center shadow-2xl">
            <h3 className="text-[16px] font-bold text-[#242421]">
              {benchmarkLoading ? "Loading benchmark…" : "Benchmark unavailable"}
            </h3>
            {benchmarkError ? (
              <p className="mt-2 text-[13px] text-[#77766f]">{benchmarkError}</p>
            ) : null}
            {!benchmarkLoading ? (
              <button type="button" className="mt-4 rounded-[7px] bg-[#242421] px-4 py-2 text-[13px] font-semibold text-white" onClick={() => setBenchmarkOpen(false)}>
                Close
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
