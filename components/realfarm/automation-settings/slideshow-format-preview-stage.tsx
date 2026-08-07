import { useEffect, useMemo, useRef, useState } from "react"
import { IconFocusCentered, IconMinus, IconPlus } from "@tabler/icons-react"

import type { TextItem } from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

import { AutomationFormatPreviewCard } from "./format-preview-card"
import type { AutomationFormatPreviewItem } from "./format-helpers"
import { AutomationFormatTextToolbar } from "./format-text-toolbar"

type SlideshowFormatTab = "Hook" | "Content" | "CTA"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15
const CANVAS_ORIGIN_Y = 168
const COMPACT_CANVAS_ORIGIN_Y = 64
const COMPACT_STAGE_WIDTH = 768
const STAGE_PADDING = 16

export function SlideshowFormatPreviewStage({
  className,
  onExitPreview,
  previewItems,
  activeTab,
  activeTextItem,
  selectedTextIndex,
  activePreviewIndex,
  previewSlotWidths,
  previewSlotHeights,
  previewGap,
  previewTrackOffset,
  zoom,
  onZoomChange,
  onSelectPreview,
  onSelectPreviewText,
  onClearTextSelection,
  onTransformPreviewText,
  updateTextItem,
  onDeleteTextItem,
  onAddTextItem,
  visualControlsLocked = false,
}: {
  className?: string
  onExitPreview: () => void
  previewItems: AutomationFormatPreviewItem[]
  activeTab: SlideshowFormatTab
  activeTextItem: TextItem
  selectedTextIndex: number | null
  activePreviewIndex: number
  previewSlotWidths: number[]
  previewSlotHeights: number[]
  previewGap: number
  previewTrackOffset: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onSelectPreview: (index: number, tab: SlideshowFormatTab) => void
  onSelectPreviewText: (
    index: number,
    tab: SlideshowFormatTab,
    textIndex: number
  ) => void
  onClearTextSelection: () => void
  onTransformPreviewText: (
    index: number,
    tab: SlideshowFormatTab,
    textIndex: number,
    patch: Partial<TextItem>
  ) => void
  updateTextItem: (patch: Partial<TextItem>) => void
  onDeleteTextItem: () => void
  onAddTextItem: () => void
  visualControlsLocked?: boolean
}) {
  const stageRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    panX: number
    panY: number
  } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // A slide is drawn at 2.5x, which overflows a phone in both axes. Start
  // narrow stages at whatever scale actually fits instead of at 100%.
  const compact = stageSize.width > 0 && stageSize.width < COMPACT_STAGE_WIDTH
  const canvasOriginY = compact ? COMPACT_CANVAS_ORIGIN_Y : CANVAS_ORIGIN_Y
  const fitZoom = useMemo(() => {
    const slotWidth = previewSlotWidths[activePreviewIndex]
    const slotHeight = previewSlotHeights[activePreviewIndex]
    if (!stageSize.width || !stageSize.height || !slotWidth || !slotHeight) {
      return 1
    }
    const scale = Math.min(
      (stageSize.width - STAGE_PADDING * 2) / slotWidth,
      (stageSize.height - canvasOriginY - STAGE_PADDING) / slotHeight,
      1
    )
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
  }, [
    activePreviewIndex,
    canvasOriginY,
    previewSlotHeights,
    previewSlotWidths,
    stageSize.height,
    stageSize.width,
  ])

  const autoFittedRef = useRef(false)
  useEffect(() => {
    if (!compact || autoFittedRef.current || fitZoom >= 1) return
    autoFittedRef.current = true
    setPan({ x: 0, y: 0 })
    onZoomChange(fitZoom)
  }, [compact, fitZoom, onZoomChange])

  function zoomAt(nextZoom: number, clientX: number, clientY: number) {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || clampedZoom === zoom) return

    const originX = rect.left + rect.width / 2
    const originY = rect.top + canvasOriginY
    const ratio = clampedZoom / zoom
    setPan((current) => ({
      x: clientX - originX - (clientX - originX - current.x) * ratio,
      y: clientY - originY - (clientY - originY - current.y) * ratio,
    }))
    onZoomChange(clampedZoom)
  }

  function zoomFromCenter(nextZoom: number) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  function resetView() {
    setPan({ x: 0, y: 0 })
    // "Fit" has to mean fit: on a narrow stage 100% is off-screen.
    onZoomChange(fitZoom)
  }

  return (
    <main
      ref={stageRef}
      className={cn(
        "relative isolate min-h-0 min-w-0 touch-none overflow-hidden bg-[#b9b9b6] outline-none focus-visible:ring-2 focus-visible:ring-[#6a6a72] focus-visible:ring-inset",
        isPanning ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      tabIndex={0}
      aria-label="Slideshow canvas. Drag the background to pan, pinch to zoom, or use the zoom controls."
      onWheel={(event) => {
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          const factor = Math.exp(-event.deltaY * 0.008)
          zoomAt(zoom * factor, event.clientX, event.clientY)
          return
        }
        setPan((current) => ({
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }))
      }}
      onPointerDown={(event) => {
        const target = event.target
        if (
          event.button !== 0 ||
          (target instanceof Element &&
            target.closest(
              "button, input, select, textarea, [role='button'], [data-slideshow-text-editor]"
            ))
        ) {
          return
        }
        dragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          panX: pan.x,
          panY: pan.y,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        setIsPanning(true)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        setPan({
          x: drag.panX + event.clientX - drag.clientX,
          y: drag.panY + event.clientY - drag.clientY,
        })
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return
        dragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        setIsPanning(false)
      }}
      onPointerCancel={() => {
        dragRef.current = null
        setIsPanning(false)
      }}
      onDoubleClick={(event) => {
        const target = event.target
        if (
          target instanceof Element &&
          target.closest(
            "button, input, select, textarea, [role='button'], [data-slideshow-text-editor]"
          )
        ) {
          return
        }
        resetView()
      }}
      onKeyDown={(event) => {
        if (event.key === "0") {
          event.preventDefault()
          resetView()
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault()
          zoomFromCenter(zoom + ZOOM_STEP)
        } else if (event.key === "-") {
          event.preventDefault()
          zoomFromCenter(zoom - ZOOM_STEP)
        }
      }}
    >
      <button
        type="button"
        className="absolute top-4 left-4 z-20 h-9 rounded-[9px] border border-black/10 bg-white/92 px-3 text-[12px] font-semibold text-[#30303a] shadow-sm backdrop-blur md:hidden"
        onClick={onExitPreview}
      >
        Edit
      </button>

      <div className="absolute top-4 left-4 z-20 hidden items-center gap-2 rounded-[9px] border border-black/10 bg-white/92 px-3 py-2 text-[11px] font-semibold text-[#30303a] shadow-sm backdrop-blur md:flex">
        <span className="size-1.5 rounded-full bg-[#4f91ff]" />
        Canvas editor
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center rounded-[9px] border border-black/10 bg-white/92 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-[6px] text-[#565663] transition-colors hover:bg-app-control-hover active:translate-y-px disabled:opacity-35"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomFromCenter(zoom - ZOOM_STEP)}
          aria-label="Zoom out slideshow canvas"
        >
          <IconMinus className="size-4" />
        </button>
        <button
          type="button"
          className="h-8 min-w-14 rounded-[6px] px-2 text-center text-xs font-semibold text-[#30303a] tabular-nums transition-colors hover:bg-app-control-hover active:translate-y-px"
          onClick={resetView}
          aria-label="Reset slideshow canvas zoom and position"
          title="Reset view (0)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-[6px] text-[#565663] transition-colors hover:bg-app-control-hover active:translate-y-px disabled:opacity-35"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomFromCenter(zoom + ZOOM_STEP)}
          aria-label="Zoom in slideshow canvas"
        >
          <IconPlus className="size-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-black/10" />
        <button
          type="button"
          className="grid size-8 place-items-center rounded-[6px] text-[#565663] transition-colors hover:bg-app-control-hover active:translate-y-px"
          onClick={resetView}
          aria-label="Fit slideshow canvas"
          title="Fit canvas (0)"
        >
          <IconFocusCentered className="size-4" />
        </button>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 will-change-transform"
        style={{
          top: `${canvasOriginY}px`,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div
          className="pointer-events-auto flex items-start transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
          style={{
            columnGap: `${previewGap}px`,
            transform: `translateX(-${previewTrackOffset}px)`,
          }}
        >
          {previewItems.map((item, index) => (
            <AutomationFormatPreviewCard
              key={item.id}
              item={item}
              index={index}
              active={activePreviewIndex === index}
              slotWidth={previewSlotWidths[index]}
              zoom={1}
              compact={false}
              selectedTextIndex={
                activePreviewIndex === index ? selectedTextIndex : null
              }
              onSelect={() => onSelectPreview(index, item.tab)}
              onSelectText={(textIndex) =>
                onSelectPreviewText(index, item.tab, textIndex)
              }
              onClearTextSelection={onClearTextSelection}
              onTransformText={(textIndex, patch) =>
                onTransformPreviewText(index, item.tab, textIndex, patch)
              }
              onAddText={
                activePreviewIndex === index && !visualControlsLocked
                  ? onAddTextItem
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/15 px-3 py-2 backdrop-blur-sm">
        {previewItems.map((item, index) => (
          <button
            key={item.id}
            className={cn(
              "size-2 rounded-full transition-colors",
              index === activePreviewIndex ? "bg-app-surface" : "bg-white/55"
            )}
            onClick={() => onSelectPreview(index, item.tab)}
            aria-label={`Select preview ${index + 1}`}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-5 left-5 hidden rounded-md bg-black/18 px-2.5 py-1.5 text-[10px] font-medium text-white/80 backdrop-blur-sm md:block">
        drag text to move · side handles resize · drag background to pan
      </div>

      {selectedTextIndex !== null && (
        <AutomationFormatTextToolbar
          mode={activeTab}
          textItem={activeTextItem}
          updateTextItem={updateTextItem}
          onDelete={onDeleteTextItem}
          onAdd={onAddTextItem}
          locked={visualControlsLocked}
        />
      )}
    </main>
  )
}
