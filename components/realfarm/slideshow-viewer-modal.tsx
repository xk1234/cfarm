"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog } from "radix-ui"
import {
  IconChartBar,
  IconCopy,
  IconDownload,
  IconTrash,
  IconX,
} from "@tabler/icons-react"

import { BenchmarkComparisonModal } from "@/components/realfarm/benchmark-comparison-modal"
import { DeleteSlideshowDialog } from "@/components/realfarm/delete-slideshow-dialog"
import { TemplateGeneratedPreview } from "@/components/realfarm/template-showcase-preview"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { exportSlideshowAsPngZip } from "@/lib/slideshow-export"
import {
  benchmarkErrorMessage,
  generateSlideshowBenchmark,
} from "@/lib/client-slideshow-benchmarks"
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
  caption?: string
  hashtags?: string
  slides: SlideshowViewerSlide[]
}

export function SlideshowViewerModal({
  title,
  slideshows,
  initialSlideshowId,
  benchmarkSlideshowId,
  fallbackSlides = [],
  onDelete,
  onDeleteSlide,
  onClose,
}: {
  title: string
  slideshows: SlideshowViewerItem[]
  initialSlideshowId?: string
  benchmarkSlideshowId?: string
  fallbackSlides?: SlideshowViewerSlide[]
  onDelete?: () => Promise<void>
  onDeleteSlide?: (slideshowItemId: string, slideIndex: number) => Promise<void>
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
      <AppModalPanel
        accessibleTitle={title}
        className="h-[min(620px,90vh)] max-w-[760px] rounded-[10px] bg-[#b9b9b6]"
      >
        <SlideshowViewerContent
          key={selectedSlideshow?.id ?? "empty"}
          title={title}
          exportTitle={selectedSlideshow?.title || title}
          slideshowTitle={selectedSlideshow?.title}
          caption={selectedSlideshow?.caption}
          hashtags={selectedSlideshow?.hashtags}
          slides={selectedSlideshow?.slides ?? []}
          fallbackSlides={fallbackSlides}
          benchmarkSlideshowId={benchmarkSlideshowId}
          onDelete={onDelete}
          onDeleteSlide={
            onDeleteSlide && selectedSlideshow
              ? (slideIndex) => onDeleteSlide(selectedSlideshow.id, slideIndex)
              : undefined
          }
          onClose={onClose}
        />
      </AppModalPanel>
    </AppModal>
  )
}

function SlideshowViewerContent({
  title,
  exportTitle,
  slideshowTitle,
  caption,
  hashtags,
  slides,
  fallbackSlides,
  benchmarkSlideshowId,
  onDelete,
  onDeleteSlide,
  onClose,
}: {
  title: string
  exportTitle: string
  slideshowTitle?: string
  caption?: string
  hashtags?: string
  slides: SlideshowViewerSlide[]
  fallbackSlides: SlideshowViewerSlide[]
  benchmarkSlideshowId?: string
  onDelete?: () => Promise<void>
  onDeleteSlide?: (slideIndex: number) => Promise<void>
  onClose: () => void
}) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [benchmark, setBenchmark] =
    useState<SlideshowBenchmarkComparison | null>(null)
  const [benchmarkOpen, setBenchmarkOpen] = useState(false)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [deletingSlide, setDeletingSlide] = useState(false)
  const boundedActiveSlide =
    slides.length > 0 ? Math.min(activeSlide, slides.length - 1) : 0
  const visibleSlots = [
    boundedActiveSlide - 1,
    boundedActiveSlide,
    boundedActiveSlide + 1,
  ]
  const descriptionAndHashtags = [caption?.trim(), hashtags?.trim()]
    .filter(Boolean)
    .join("\n\n")

  async function copyMetadata(label: string, value: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`${label} couldn’t be copied`)
    }
  }

  async function exportSlides() {
    setExporting(true)
    try {
      await exportSlideshowAsPngZip({ title: exportTitle, slides })
    } catch (error) {
      toast.error("Slideshow couldn’t be exported", {
        description:
          error instanceof Error
            ? error.message
            : "The slideshow could not be exported.",
      })
    } finally {
      setExporting(false)
    }
  }

  async function deleteActiveSlide() {
    if (!onDeleteSlide || slides.length === 0 || deletingSlide) return
    setDeletingSlide(true)
    try {
      await onDeleteSlide(boundedActiveSlide)
      setActiveSlide((current) => Math.max(0, current - 1))
      toast.success(`Slide ${boundedActiveSlide + 1} deleted`)
    } catch (error) {
      toast.error("The slide could not be deleted", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setDeletingSlide(false)
    }
  }

  async function openBenchmark() {
    if (!benchmarkSlideshowId) return
    setBenchmarkOpen(true)
    if (benchmark) return
    setBenchmarkLoading(true)
    try {
      setBenchmark(await generateSlideshowBenchmark(benchmarkSlideshowId))
    } catch (error) {
      setBenchmarkOpen(false)
      toast.error("Benchmark generation failed", {
        description: benchmarkErrorMessage(error),
      })
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
          {onDelete ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-red-200 bg-white px-3.5 text-[13px] font-semibold text-red-600 shadow-sm transition hover:bg-red-50"
              onClick={() => setDeleteOpen(true)}
            >
              <IconTrash className="size-4" />
              Delete
            </button>
          ) : null}
          {benchmarkSlideshowId ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#d8d7cf] bg-white px-3.5 text-[13px] font-semibold text-[#242421] shadow-sm transition hover:bg-[#f4f3ee]"
              onClick={() => void openBenchmark()}
            >
              <IconChartBar className="size-4" />
              {benchmarkLoading ? "Generating…" : "Benchmark"}
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
      <main className="relative flex h-[calc(100%-60px)] flex-col overflow-hidden">
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
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
                    {onDeleteSlide &&
                    absoluteIndex === boundedActiveSlide &&
                    slides.length > 1 ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-600 disabled:opacity-50"
                        aria-label={`Delete slide ${absoluteIndex + 1}`}
                        title="Delete this slide"
                        onClick={(event) => {
                          event.stopPropagation()
                          void deleteActiveSlide()
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.stopPropagation()
                            void deleteActiveSlide()
                          }
                        }}
                      >
                        <IconTrash className="size-4" />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
          {slides.length > 0 ? (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
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
        </div>
        {slideshowTitle || caption || hashtags ? (
          <div className="shrink-0 space-y-1.5 border-t border-[#a8a8a5] bg-[#f7f7f4] px-5 py-3 text-[13px] leading-5">
            {slideshowTitle ? (
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold tracking-[0.06em] text-[#77766f] uppercase">
                    Title{" "}
                  </span>
                  <span className="font-semibold text-[#242421]">
                    {slideshowTitle}
                  </span>
                </div>
                <button
                  type="button"
                  className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-[#d8d7cf] bg-white text-[#56554f] shadow-sm hover:bg-[#efeee9]"
                  onClick={() =>
                    void copyMetadata("Title", slideshowTitle)
                  }
                  aria-label="Copy title"
                  title="Copy title"
                >
                  <IconCopy className="size-3.5" />
                </button>
              </div>
            ) : null}
            {descriptionAndHashtags ? (
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 whitespace-pre-wrap">
                  <span className="text-[10px] font-bold tracking-[0.06em] text-[#77766f] uppercase">
                    Description + hashtags{" "}
                  </span>
                  <span className="font-medium text-[#3a3936]">
                    {descriptionAndHashtags}
                  </span>
                </div>
                <button
                  type="button"
                  className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-[#d8d7cf] bg-white text-[#56554f] shadow-sm hover:bg-[#efeee9]"
                  onClick={() =>
                    void copyMetadata(
                      "Description and hashtags",
                      descriptionAndHashtags
                    )
                  }
                  aria-label="Copy description and hashtags"
                  title="Copy description and hashtags"
                >
                  <IconCopy className="size-3.5" />
                </button>
              </div>
            ) : null}
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
        <AppModal className="z-[90]" onClose={() => undefined}>
          <AppModalPanel className="max-w-md p-6 text-center">
            <Dialog.Title className="text-[16px] font-bold text-[#242421]">
              Generating benchmark…
            </Dialog.Title>
            <p className="mt-2 text-[13px] text-[#77766f]">
              Grading all {slides.length} slides. This can take up to a minute.
            </p>
          </AppModalPanel>
        </AppModal>
      ) : null}
      {deleteOpen && onDelete ? (
        <DeleteSlideshowDialog
          onCancel={() => setDeleteOpen(false)}
          onConfirm={onDelete}
        />
      ) : null}
    </>
  )
}
