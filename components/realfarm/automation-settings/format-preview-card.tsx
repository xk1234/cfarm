"use client"

import dynamic from "next/dynamic"
import type { TextItem } from "@/lib/realfarm-automation"
import {
  renderedSlideSvg,
  renderedTextItemEditorBounds,
  slideDimensions,
} from "@/lib/slideshow-renderer"
import { cn } from "@/lib/utils"
import { LuPlus } from "react-icons/lu"

import {
  formatAspectRatioCss,
  formatPreviewCardSize,
  konvaTextTransformPatch,
  previewSlideshowAspectRatio,
  previewSlideshowFont,
  previewSlideshowSlide,
  type AutomationFormatPreviewItem,
} from "./format-helpers"
import { clickTargetsSlideshowTextEditor } from "./slide-editor-events"

const KonvaTextOverlay = dynamic(
  () =>
    import("../konva-text-overlay").then((module) => module.KonvaTextOverlay),
  { ssr: false }
)

function FormatEmptyCollectionTile() {
  return (
    <div className="grid h-full place-items-center bg-[#deddd8] px-2 text-center text-[10px] font-semibold tracking-[0.04em] text-app-muted-text uppercase">
      Select collection
    </div>
  )
}

export function AutomationFormatPreviewCard({
  item,
  index,
  active,
  slotWidth,
  zoom,
  compact,
  showLabel = true,
  selectedTextIndex,
  onSelect,
  onSelectText,
  onClearTextSelection,
  onTransformText,
  onAddText,
}: {
  item: AutomationFormatPreviewItem
  index: number
  active: boolean
  slotWidth: number
  zoom: number
  compact?: boolean
  showLabel?: boolean
  selectedTextIndex: number | null
  onSelect: () => void
  onSelectText: (index: number) => void
  onClearTextSelection: () => void
  onTransformText: (index: number, patch: Partial<TextItem>) => void
  onAddText?: () => void
}) {
  const previewBaseScale = 2.5
  const displayScale = compact ? 1 : previewBaseScale * zoom
  const size = formatPreviewCardSize(item.section.aspect_ratio, item.image)
  const slide = previewSlideshowSlide(item, index)
  const aspectRatio = previewSlideshowAspectRatio(item)
  const font = previewSlideshowFont(item)
  const overlayUrl = slide.overlayImage?.image_url
  const previewSvg = item.image
    ? renderedSlideSvg(slide, item.image.imageUrl, overlayUrl, {
        aspectRatio,
        font,
        iconUrls: slide.iconLayout?.surrounding.map((icon) => icon.image_url),
      })
    : ""
  const previewTextItems = slide.textItems
  const dimensions = slideDimensions(aspectRatio)
  const selectionBounds = renderedTextItemEditorBounds(
    previewTextItems,
    dimensions.width,
    dimensions.height
  )

  return (
    <div
      className={cn(
        "group/slide shrink-0 cursor-pointer transition-opacity duration-300",
        active ? "opacity-100" : "opacity-65"
      )}
      style={{ width: slotWidth, minWidth: slotWidth, maxWidth: slotWidth }}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (clickTargetsSlideshowTextEditor(event.target)) return
        onSelect()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect()
        }
      }}
    >
      <div
        className="mx-auto"
        style={{
          width: size.width * displayScale,
          height: (size.height + (showLabel ? 28 : 0)) * displayScale,
        }}
      >
        <div
          className="origin-top-left"
          style={{
            width: size.width,
            transform: `scale(${displayScale})`,
          }}
        >
          {showLabel ? (
            <div
              className="mb-2 text-left text-[12px] font-bold text-app-muted-text"
              style={{ width: size.width }}
            >
              {item.label}
            </div>
          ) : null}
          <div
            className="relative overflow-hidden rounded-[2px] shadow-sm"
            style={{
              width: size.width,
              height: size.height,
              aspectRatio: formatAspectRatioCss(
                item.section.aspect_ratio,
                item.image
              ),
            }}
          >
            {item.image ? (
              <>
                <div
                  className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
                {active && !item.section.noText && item.text ? (
                  <KonvaTextOverlay
                    bounds={selectionBounds}
                    canvasWidth={dimensions.width}
                    canvasHeight={dimensions.height}
                    displayWidth={size.width}
                    displayHeight={size.height}
                    selectedTextIndex={selectedTextIndex}
                    onSelectText={onSelectText}
                    onClearTextSelection={onClearTextSelection}
                    onTextTransform={(textIndex, transform) =>
                      onTransformText(
                        textIndex,
                        konvaTextTransformPatch({
                          ...transform,
                          textAlign: item.textItems[textIndex]?.textAlign,
                        })
                      )
                    }
                  />
                ) : null}
              </>
            ) : (
              <FormatEmptyCollectionTile />
            )}
            {!item.section.noText && onAddText ? (
              <button
                type="button"
                className="absolute right-2 bottom-2 left-2 z-20 flex items-center justify-center gap-1 rounded-md border border-dashed border-white/70 bg-black/20 py-1.5 text-[9px] font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/slide:opacity-100 focus:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  onAddText()
                }}
              >
                <LuPlus className="size-3" />
                Add text
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
