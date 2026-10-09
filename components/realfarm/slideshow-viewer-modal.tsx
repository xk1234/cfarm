"use client"

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react"
import { toast } from "sonner"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconDots,
  IconFocusCentered,
  IconLoader2,
  IconTrash,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react"
import { DropdownMenu } from "radix-ui"

import { DeleteSlideshowDialog } from "@/components/realfarm/delete-slideshow-dialog"
import { SlidePreview } from "@/components/realfarm/slide-preview"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { useDirtyGuard } from "@/components/ui/use-dirty-guard"
import { exportSlideshowAsPngZip } from "@/lib/slideshow-export"
import {
  clampSlideTransform,
  clampSlideZoom,
  fitSlideToViewport,
  zoomSlideAroundPoint,
  type SlideViewportPoint,
  type SlideViewportTransform,
} from "@/lib/slideshow-viewport"
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
  caption?: string
  hashtags?: string
  slides: SlideshowViewerSlide[]
}

export type SlideshowViewerDetails = {
  creationDate: string
  postDate: string
  language: string
}

export type SlideshowViewerMetadata = {
  title: string
  caption: string
  hashtags: string
}

export type SlideshowViewerAction = {
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
}

export function SlideshowViewerModal({
  title,
  slideshows,
  initialSlideshowId,
  fallbackSlides = [],
  details,
  publicationStatusControl,
  actions = [],
  onDelete,
  onUpdateMetadata,
  onClose,
}: {
  title: string
  slideshows: SlideshowViewerItem[]
  initialSlideshowId?: string
  fallbackSlides?: SlideshowViewerSlide[]
  details?: SlideshowViewerDetails
  publicationStatusControl?: ReactNode
  actions?: SlideshowViewerAction[]
  onDelete?: () => Promise<void>
  onUpdateMetadata?: (
    slideshowItemId: string,
    metadata: SlideshowViewerMetadata
  ) => Promise<void>
  onClose: () => void
}) {
  const initialIndex = Math.max(
    0,
    slideshows.findIndex((slideshow) => slideshow.id === initialSlideshowId)
  )
  const boundedIndex =
    slideshows.length > 0 ? Math.min(initialIndex, slideshows.length - 1) : 0
  const selectedSlideshow = slideshows[boundedIndex]
  const [metadataDirty, setMetadataDirty] = useState(false)
  const dirtyGuard = useDirtyGuard(metadataDirty)

  function requestClose() {
    dirtyGuard.run(onClose)
  }

  return (
    <>
      <AppModal className="p-0 sm:p-4" onClose={requestClose}>
        <AppModalPanel
          accessibleTitle={title}
          className="flex h-dvh max-w-none flex-col rounded-none bg-[#b9b9b6] sm:h-[min(880px,94vh)] sm:max-w-[1180px] sm:rounded-[10px]"
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
            details={details}
            publicationStatusControl={publicationStatusControl}
            actions={actions}
            onDelete={onDelete}
            onUpdateMetadata={
              onUpdateMetadata && selectedSlideshow
                ? (metadata) => onUpdateMetadata(selectedSlideshow.id, metadata)
                : undefined
            }
            onDirtyChange={setMetadataDirty}
            onClose={requestClose}
          />
        </AppModalPanel>
      </AppModal>
      {dirtyGuard.confirmation}
    </>
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
  details,
  publicationStatusControl,
  actions,
  onDelete,
  onUpdateMetadata,
  onDirtyChange,
  onClose,
}: {
  title: string
  exportTitle: string
  slideshowTitle?: string
  caption?: string
  hashtags?: string
  slides: SlideshowViewerSlide[]
  fallbackSlides: SlideshowViewerSlide[]
  details?: SlideshowViewerDetails
  publicationStatusControl?: ReactNode
  actions: SlideshowViewerAction[]
  onDelete?: () => Promise<void>
  onUpdateMetadata?: (metadata: SlideshowViewerMetadata) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
}) {
  const [activeSlide, setActiveSlide] = useState(0)
  // Below sm the publishing form is a sheet over the slides, so opening it is
  // an explicit choice and closing it returns you to the slideshow.
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsHidden, setDetailsHidden] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const initialMetadata = {
    title: slideshowTitle ?? "",
    caption: caption ?? "",
    hashtags: hashtags ?? "",
  }
  const [metadata, setMetadata] =
    useState<SlideshowViewerMetadata>(initialMetadata)
  const [savedMetadata, setSavedMetadata] =
    useState<SlideshowViewerMetadata>(initialMetadata)
  const [savingMetadata, setSavingMetadata] = useState(false)
  const boundedActiveSlide =
    slides.length > 0 ? Math.min(activeSlide, slides.length - 1) : 0
  const visibleSlide = slides[boundedActiveSlide]
  const descriptionAndHashtags = [
    metadata.caption.trim(),
    metadata.hashtags.trim(),
  ]
    .filter(Boolean)
    .join("\n\n")
  const metadataChanged =
    metadata.title !== savedMetadata.title ||
    metadata.caption !== savedMetadata.caption ||
    metadata.hashtags !== savedMetadata.hashtags

  useEffect(() => {
    onDirtyChange(metadataChanged)
    return () => onDirtyChange(false)
  }, [metadataChanged, onDirtyChange])

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
      await exportSlideshowAsPngZip({
        title: metadata.title.trim() || exportTitle,
        slides,
      })
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

  async function saveMetadata() {
    if (!onUpdateMetadata || savingMetadata || !metadataChanged) return
    if (!metadata.title.trim()) {
      toast.error("Add a title before saving")
      return
    }
    setSavingMetadata(true)
    try {
      const normalized = {
        title: metadata.title.trim(),
        caption: metadata.caption.trim(),
        hashtags: metadata.hashtags.trim(),
      }
      await onUpdateMetadata(normalized)
      setMetadata(normalized)
      setSavedMetadata(normalized)
      setDetailsOpen(false)
      toast.success("Slideshow details saved")
    } catch (error) {
      toast.error("The slideshow details could not be saved", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setSavingMetadata(false)
    }
  }

  return (
    <>
      <header className="flex h-[calc(52px+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-1.5 border-b border-[#d7d6d0] bg-app-surface px-2 pt-[env(safe-area-inset-top)] sm:h-[60px] sm:gap-2 sm:pt-0">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <button
            className="grid size-10 shrink-0 place-items-center rounded-[7px] text-app-muted-text transition hover:bg-app-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-action sm:size-9 sm:rounded-[5px]"
            onClick={onClose}
            aria-label="Close slideshow"
          >
            <IconX className="size-5" />
          </button>
          <h2 className="min-w-0 truncate text-[14px] font-semibold text-app-text max-[360px]:sr-only sm:text-[18px]">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden sm:block">{publicationStatusControl}</div>
          <SlideshowActionsMenu
            actions={actions}
            exporting={exporting}
            exportDisabled={slides.length === 0}
            onExport={() => void exportSlides()}
            onDelete={onDelete ? () => setDeleteOpen(true) : undefined}
          />
        </div>
      </header>
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#efefec]">
        {publicationStatusControl ? (
          <div className="absolute top-2 left-3 z-20 sm:hidden">
            {publicationStatusControl}
          </div>
        ) : null}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pt-4 pb-16 sm:px-10 sm:pt-7 sm:pb-20">
            {slides.length === 0 ? (
              <SlidePreview
                slides={fallbackSlides}
                tileCount={3}
                className="h-[356px] w-[620px] max-w-full rounded-[9px] shadow-xl"
              />
            ) : (
              // The arrows overlay the slide below sm: side-by-side they left
              // a phone barely 200px for the slide itself.
              <div className="flex h-full min-h-0 w-full max-w-full items-center justify-center gap-3">
                <button
                  type="button"
                  className="absolute left-2 z-10 grid size-10 shrink-0 place-items-center rounded-full bg-white/88 text-app-text shadow-md transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-30 sm:static"
                  onClick={() => setActiveSlide(boundedActiveSlide - 1)}
                  disabled={boundedActiveSlide === 0}
                  aria-label="Previous slide"
                >
                  <IconChevronLeft className="size-5" />
                </button>
                <InteractiveSlideStage
                  key={visibleSlide.id}
                  slide={visibleSlide}
                  alt={
                    visibleSlide.text ||
                    `${title} slide ${boundedActiveSlide + 1}`
                  }
                  label={`Slide ${boundedActiveSlide + 1} of ${slides.length}`}
                />
                <button
                  type="button"
                  className="absolute right-2 z-10 grid size-10 shrink-0 place-items-center rounded-full bg-white/88 text-app-text shadow-md transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-30 sm:static"
                  onClick={() => setActiveSlide(boundedActiveSlide + 1)}
                  disabled={boundedActiveSlide === slides.length - 1}
                  aria-label="Next slide"
                >
                  <IconChevronRight className="size-5" />
                </button>
              </div>
            )}
            {slides.length > 0 ? (
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-6">
                {slides.map((_, dot) => (
                  <button
                    key={dot}
                    type="button"
                    className={cn(
                      "size-2 rounded-full",
                      dot === boundedActiveSlide
                        ? "bg-app-surface"
                        : "bg-white/55"
                    )}
                    onClick={() => setActiveSlide(dot)}
                    aria-label={`Show slide ${dot + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
        <button
          type="button"
          className="flex h-12 shrink-0 items-center justify-between border-t border-[#cfcec8] bg-[#f8f8f5] px-4 text-[13px] font-semibold text-app-text sm:hidden"
          aria-expanded={detailsOpen}
          aria-controls="slideshow-publishing-details"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Publishing details
          <IconChevronDown
            className={cn("size-4 transition", detailsOpen && "rotate-180")}
          />
        </button>
        {detailsHidden ? (
          <button
            type="button"
            className="hidden h-10 shrink-0 items-center justify-between border-t border-[#cfcec8] bg-[#f8f8f5] px-5 text-[13px] font-semibold text-app-text sm:flex"
            aria-expanded="false"
            aria-controls="slideshow-publishing-details"
            onClick={() => setDetailsHidden(false)}
          >
            Publishing details
            <IconChevronDown className="size-4 rotate-180" />
          </button>
        ) : null}
        <SlideshowInformationPanel
          className={cn(
            !detailsOpen && "hidden sm:block",
            detailsHidden && "sm:hidden"
          )}
          metadata={metadata}
          metadataChanged={metadataChanged}
          saving={savingMetadata}
          editable={Boolean(onUpdateMetadata)}
          details={details}
          onMetadataChange={setMetadata}
          onClose={() => setDetailsOpen(false)}
          onHide={() => setDetailsHidden(true)}
          onSave={() => void saveMetadata()}
          onCopyTitle={() => void copyMetadata("Title", metadata.title)}
          onCopyDescription={() =>
            void copyMetadata(
              "Description and hashtags",
              descriptionAndHashtags
            )
          }
        />
      </main>
      {deleteOpen && onDelete ? (
        <DeleteSlideshowDialog
          onCancel={() => setDeleteOpen(false)}
          onConfirm={onDelete}
        />
      ) : null}
    </>
  )
}

const slideshowMenuItemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] font-semibold text-app-text outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-app-control-hover"

function SlideshowActionsMenu({
  actions,
  exporting,
  exportDisabled,
  onExport,
  onDelete,
}: {
  actions: SlideshowViewerAction[]
  exporting: boolean
  exportDisabled: boolean
  onExport: () => void
  onDelete?: () => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-[7px] border border-app-panel-border bg-app-surface text-app-text shadow-sm transition hover:bg-app-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-action active:translate-y-px sm:size-9 sm:focus-visible:outline-offset-2"
          aria-label="More slideshow actions"
          title="More actions"
        >
          <IconDots className="size-5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="app-popover z-[120] min-w-[210px] p-1"
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              disabled={action.disabled}
              className={slideshowMenuItemClass}
              onSelect={action.onSelect}
            >
              <span className="grid size-4 shrink-0 place-items-center text-app-muted-text">
                {action.icon}
              </span>
              {action.label}
            </DropdownMenu.Item>
          ))}
          {actions.length ? (
            <DropdownMenu.Separator className="my-1 h-px bg-app-panel-border" />
          ) : null}
          <DropdownMenu.Item
            disabled={exportDisabled || exporting}
            className={slideshowMenuItemClass}
            onSelect={onExport}
          >
            {exporting ? (
              <IconLoader2 className="size-4 animate-spin text-app-muted-text" />
            ) : (
              <IconDownload className="size-4 text-app-muted-text" />
            )}
            {exporting ? "Exporting PNGs" : "Export PNGs"}
          </DropdownMenu.Item>
          {onDelete ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-app-panel-border" />
              <DropdownMenu.Item
                className={`${slideshowMenuItemClass} text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700`}
                onSelect={onDelete}
              >
                <IconTrash className="size-4" />
                Delete slideshow
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

type SlidePointer = SlideViewportPoint & { id: number }

export function InteractiveSlideStage({
  slide,
  alt,
  label,
}: {
  slide: SlideshowViewerSlide
  alt: string
  label: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, SlidePointer>())
  const dragStartRef = useRef<{
    pointer: SlidePointer
    transform: SlideViewportTransform
  } | null>(null)
  const pinchStartRef = useRef<{
    distance: number
    midpoint: SlideViewportPoint
    transform: SlideViewportTransform
  } | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState({ width: 4, height: 5 })
  const [transform, setTransform] = useState<SlideViewportTransform>({
    zoom: 1,
    x: 0,
    y: 0,
  })
  const transformRef = useRef(transform)
  const [panning, setPanning] = useState(false)
  const stage = fitSlideToViewport(viewport, imageSize)
  const stageReady = viewport.width > 0 && viewport.height > 0

  function commitTransform(next: SlideViewportTransform) {
    transformRef.current = next
    setTransform(next)
  }

  function updateTransform(
    updater: (current: SlideViewportTransform) => SlideViewportTransform
  ) {
    setTransform((current) => {
      const next = updater(current)
      transformRef.current = next
      return next
    })
  }

  function resetView() {
    commitTransform({ zoom: 1, x: 0, y: 0 })
  }

  function zoomTo(
    nextZoom: number,
    point: SlideViewportPoint = { x: 0, y: 0 }
  ) {
    updateTransform((current) =>
      zoomSlideAroundPoint(current, nextZoom, point, stage, viewport)
    )
  }

  useEffect(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement) return

    function measure(element: HTMLDivElement) {
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
      }
      setViewport((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next
      )
    }

    measure(viewportElement)
    const observer = new ResizeObserver(() => measure(viewportElement))
    observer.observe(viewportElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    updateTransform((current) => clampSlideTransform(current, stage, viewport))
    // The separate numeric dependencies keep the effect stable between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.width, stage.height, viewport.width, viewport.height])

  function pointFor(clientX: number, clientY: number): SlideViewportPoint {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    }
  }

  function startPinch() {
    const [first, second] = [...pointersRef.current.values()]
    if (!first || !second) return
    pinchStartRef.current = {
      distance: pointerDistance(first, second),
      midpoint: pointerMidpoint(first, second),
      transform: transformRef.current,
    }
    dragStartRef.current = null
    setPanning(true)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button")) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = {
      id: event.pointerId,
      ...pointFor(event.clientX, event.clientY),
    }
    pointersRef.current.set(event.pointerId, pointer)

    if (pointersRef.current.size === 1) {
      dragStartRef.current = {
        pointer,
        transform: transformRef.current,
      }
      setPanning(true)
    } else if (pointersRef.current.size === 2) {
      startPinch()
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return
    event.preventDefault()
    const pointer = {
      id: event.pointerId,
      ...pointFor(event.clientX, event.clientY),
    }
    pointersRef.current.set(event.pointerId, pointer)

    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const [first, second] = [...pointersRef.current.values()]
      if (!first || !second) return
      const start = pinchStartRef.current
      const midpoint = pointerMidpoint(first, second)
      const zoom = clampSlideZoom(
        start.transform.zoom *
          (pointerDistance(first, second) / Math.max(1, start.distance))
      )
      const ratio = zoom / start.transform.zoom
      commitTransform(
        clampSlideTransform(
          {
            zoom,
            x: midpoint.x - (start.midpoint.x - start.transform.x) * ratio,
            y: midpoint.y - (start.midpoint.y - start.transform.y) * ratio,
          },
          stage,
          viewport
        )
      )
      return
    }

    const start = dragStartRef.current
    if (!start || start.pointer.id !== event.pointerId) return
    commitTransform(
      clampSlideTransform(
        {
          zoom: start.transform.zoom,
          x: start.transform.x + pointer.x - start.pointer.x,
          y: start.transform.y + pointer.y - start.pointer.y,
        },
        stage,
        viewport
      )
    )
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId)
    pinchStartRef.current = null

    const remaining = [...pointersRef.current.values()][0]
    dragStartRef.current = remaining
      ? { pointer: remaining, transform: transformRef.current }
      : null
    setPanning(Boolean(remaining))
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const point = pointFor(event.clientX, event.clientY)
    const sensitivity = event.deltaMode === 1 ? 0.04 : 0.002
    zoomTo(
      transformRef.current.zoom * Math.exp(-event.deltaY * sensitivity),
      point
    )
  }

  function onDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button")) return
    event.preventDefault()
    if (transformRef.current.zoom > 1) {
      resetView()
    } else {
      zoomTo(2, pointFor(event.clientX, event.clientY))
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault()
      zoomTo(transformRef.current.zoom + 0.25)
      return
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault()
      zoomTo(transformRef.current.zoom - 0.25)
      return
    }
    if (event.key === "0" || event.key === "Escape") {
      event.preventDefault()
      resetView()
      return
    }

    const movement =
      event.key === "ArrowLeft"
        ? { x: -48, y: 0 }
        : event.key === "ArrowRight"
          ? { x: 48, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -48 }
            : event.key === "ArrowDown"
              ? { x: 0, y: 48 }
              : null
    if (!movement) return
    event.preventDefault()
    updateTransform((current) =>
      clampSlideTransform(
        {
          ...current,
          x: current.x + movement.x,
          y: current.y + movement.y,
        },
        stage,
        viewport
      )
    )
  }

  return (
    <div
      ref={viewportRef}
      className="relative flex h-full min-h-0 w-full max-w-[760px] min-w-0 items-center justify-center sm:max-w-[min(72vw,760px)] sm:shrink-0"
    >
      <div
        className="min-h-0 max-w-full shrink-0"
        style={
          stageReady
            ? { width: stage.width, height: stage.height, touchAction: "none" }
            : {
                width: "min(100%, 400px)",
                maxHeight: "100%",
                aspectRatio: "4 / 5",
                touchAction: "none",
              }
        }
      >
        <div
          ref={stageRef}
          data-slide-media-frame
          className={cn(
            "group relative isolate size-full overflow-hidden rounded-[9px] bg-app-surface text-left shadow-xl ring-2 ring-white select-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-app-action",
            panning ? "cursor-grabbing" : "cursor-grab"
          )}
          role="group"
          aria-label={`${label}. Use the mouse wheel or plus and minus keys to zoom the slide canvas. Drag or use arrow keys to move it.`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onLostPointerCapture={finishPointer}
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.zoom})`,
            transformOrigin: "center",
            willChange: "transform",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Generated slides may be authenticated local or remote assets and expose their dimensions only after loading. */}
          <img
            src={slide.imageUrl}
            alt={alt}
            className="absolute inset-0 block size-full object-cover"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setImageSize({
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                })
              }
            }}
          />

          <div className="pointer-events-none absolute top-2 left-2 z-10 hidden rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-app-text opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
            Scroll to zoom · drag to pan
          </div>

          <div
            className="absolute bottom-2 left-2 z-20 flex items-center gap-0.5 rounded-full bg-white/92 p-1 text-app-text shadow-md backdrop-blur"
            role="toolbar"
            aria-label="Slide zoom controls"
          >
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full transition hover:bg-black/7 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={transform.zoom <= 1}
              onClick={() => zoomTo(transformRef.current.zoom - 0.25)}
            >
              <IconZoomOut className="size-4" />
            </button>
            <output
              className="min-w-11 text-center text-[11px] font-bold tabular-nums"
              aria-live="polite"
            >
              {Math.round(transform.zoom * 100)}%
            </output>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full transition hover:bg-black/7 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={transform.zoom >= 5}
              onClick={() => zoomTo(transformRef.current.zoom + 0.25)}
            >
              <IconZoomIn className="size-4" />
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full transition hover:bg-black/7 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Reset zoom and position"
              title="Reset zoom and position"
              disabled={
                transform.zoom === 1 && transform.x === 0 && transform.y === 0
              }
              onClick={resetView}
            >
              <IconFocusCentered className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function pointerDistance(
  first: SlideViewportPoint,
  second: SlideViewportPoint
) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function pointerMidpoint(
  first: SlideViewportPoint,
  second: SlideViewportPoint
) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function SlideshowInformationPanel({
  className,
  metadata,
  metadataChanged,
  saving,
  editable,
  details,
  onMetadataChange,
  onClose,
  onHide,
  onSave,
  onCopyTitle,
  onCopyDescription,
}: {
  className?: string
  metadata: SlideshowViewerMetadata
  metadataChanged: boolean
  saving: boolean
  editable: boolean
  details?: SlideshowViewerDetails
  onMetadataChange: (metadata: SlideshowViewerMetadata) => void
  onClose: () => void
  onHide: () => void
  onSave: () => void
  onCopyTitle: () => void
  onCopyDescription: () => void
}) {
  const [publishingCopy, setPublishingCopy] = useState(() =>
    combinePublishingCopy(metadata)
  )

  function updatePublishingCopy(value: string) {
    setPublishingCopy(value)
    onMetadataChange({ ...metadata, ...splitPublishingCopy(value) })
  }

  return (
    <section
      id="slideshow-publishing-details"
      className={cn(
        "max-h-[70dvh] w-full min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-t border-[#cfcec8] bg-[#f8f8f5] px-4 py-4 sm:max-h-[270px] sm:px-5",
        className
      )}
    >
      <div className="mx-auto w-full max-w-[1040px] min-w-0">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="hidden text-[14px] font-semibold tracking-[-0.01em] text-app-text sm:block">
              Publishing details
            </h3>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {editable ? (
                <>
                  <button
                    type="button"
                    className="h-9 flex-1 rounded-[6px] bg-[#e8e7e1] px-3.5 text-[12px] font-semibold text-app-muted-text transition active:translate-y-px sm:hidden"
                    onClick={onClose}
                  >
                    Back to slides
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "h-9 flex-1 rounded-[6px] px-3.5 text-[12px] font-semibold transition active:translate-y-px disabled:cursor-not-allowed sm:h-8 sm:flex-none",
                      metadataChanged
                        ? "bg-app-action text-white hover:brightness-95 disabled:opacity-45"
                        : "bg-[#e8e7e1] text-app-muted-text"
                    )}
                    disabled={
                      !metadataChanged || saving || !metadata.title.trim()
                    }
                    onClick={onSave}
                  >
                    {saving
                      ? "Saving…"
                      : metadataChanged
                        ? "Save changes"
                        : "Saved"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="hidden size-8 shrink-0 place-items-center rounded-[6px] text-app-muted-text transition hover:bg-[#e8e7e1] hover:text-app-text sm:grid"
                onClick={onHide}
                aria-label="Hide publishing details"
                aria-expanded="true"
                aria-controls="slideshow-publishing-details"
                title="Hide publishing details"
              >
                <IconChevronDown className="size-4" />
              </button>
            </div>
          </div>

          {details ? (
            <dl className="mb-4 grid grid-cols-1 gap-3 rounded-[8px] bg-app-surface-subtle px-3 py-3 sm:grid-cols-3">
              <ViewerDetail
                label="Creation date"
                value={details.creationDate}
              />
              <ViewerDetail label="Post date" value={details.postDate} />
              <ViewerDetail label="Language" value={details.language} />
            </dl>
          ) : null}

          <div className="min-w-0 divide-y divide-[#deddd7] border-y border-app-panel-border">
            <div className="min-w-0 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="slideshow-publishing-title"
                  className="text-[10px] font-semibold tracking-[0.04em] text-app-muted-text"
                >
                  Title
                </label>
                <InlineCopyButton label="Copy title" onClick={onCopyTitle} />
              </div>
              <input
                id="slideshow-publishing-title"
                className={cn(
                  "block h-7 w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold tracking-[-0.01em] text-[#292925] outline-none placeholder:text-[#aaa8a0] focus:text-app-action",
                  !editable && "cursor-default text-[#65645f]"
                )}
                value={metadata.title}
                readOnly={!editable}
                maxLength={180}
                onChange={(event) =>
                  onMetadataChange({ ...metadata, title: event.target.value })
                }
                placeholder="Add a title"
              />
            </div>

            <div className="min-w-0 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="slideshow-publishing-copy"
                  className="text-[10px] font-semibold tracking-[0.04em] text-app-muted-text"
                >
                  Description + hashtags
                </label>
                <InlineCopyButton
                  label="Copy description and hashtags"
                  onClick={onCopyDescription}
                />
              </div>
              <textarea
                id="slideshow-publishing-copy"
                className={cn(
                  "block h-[76px] w-full min-w-0 resize-none border-0 bg-transparent p-0 text-[13px] leading-5 font-medium text-[#3c3b37] outline-none placeholder:text-[#aaa8a0] focus:text-app-text",
                  !editable && "cursor-default text-[#65645f]"
                )}
                value={publishingCopy}
                readOnly={!editable}
                maxLength={2700}
                onChange={(event) => updatePublishingCopy(event.target.value)}
                placeholder="Add the post description and hashtags"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function InlineCopyButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="grid size-7 place-items-center rounded-[5px] text-app-muted-text transition hover:bg-[#e7e6e0] hover:text-app-action"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <IconCopy className="size-3.5" />
    </button>
  )
}

function combinePublishingCopy(metadata: SlideshowViewerMetadata) {
  return [metadata.caption.trim(), metadata.hashtags.trim()]
    .filter(Boolean)
    .join("\n\n")
}

function splitPublishingCopy(value: string) {
  const paragraphs = value.split(/\n\s*\n/)
  const lastParagraph = paragraphs.at(-1)?.trim() || ""
  const isHashtagParagraph =
    Boolean(lastParagraph) &&
    lastParagraph
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => token.startsWith("#"))

  return isHashtagParagraph
    ? {
        caption: paragraphs.slice(0, -1).join("\n\n").trim(),
        hashtags: lastParagraph,
      }
    : { caption: value, hashtags: "" }
}

function ViewerDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-[0.04em] text-app-text-faint">
        {label}
      </dt>
      <dd
        className="mt-1 truncate text-[13px] font-semibold text-[#292925] tabular-nums"
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
