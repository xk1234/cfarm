import {
  renderedSlideSvg,
  renderedTextItemEditorBounds,
  slideDimensions,
} from "@/lib/slideshow-renderer"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"

import {
  formatAspectRatioCss,
  formatPreviewCardSize,
  previewSlideshowAspectRatio,
  previewSlideshowFont,
  previewSlideshowSlide,
  type AutomationFormatPreviewItem,
} from "./format-helpers"

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
  selectedTextIndex,
  onSelect,
  onSelectText,
  onAddText,
}: {
  item: AutomationFormatPreviewItem
  index: number
  active: boolean
  slotWidth: number
  zoom: number
  compact?: boolean
  selectedTextIndex: number | null
  onSelect: () => void
  onSelectText: (index: number) => void
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
      })
    : ""
  const previewTextItems = slide.textItems
  const selectionBoxes = textSelectionBoxes(slide, aspectRatio)

  return (
    <div
      className={cn(
        "group/slide shrink-0 cursor-pointer transition-opacity duration-300",
        active ? "opacity-100" : "opacity-65"
      )}
      style={{ width: slotWidth, minWidth: slotWidth, maxWidth: slotWidth }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
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
          height: (size.height + 28) * displayScale,
        }}
      >
        <div
          className="origin-top-left"
          style={{
            width: size.width,
            transform: `scale(${displayScale})`,
          }}
        >
          <div
            className="mb-2 text-left text-[12px] font-bold text-app-muted-text"
            style={{ width: size.width }}
          >
            {item.label}
          </div>
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
              <div
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
            ) : (
              <FormatEmptyCollectionTile />
            )}
            {!item.section.noText && item.text
              ? previewTextItems.map((previewText, textIndex) => {
                  const textItem = item.textItems[textIndex]
                  const selected = selectedTextIndex === textIndex
                  if (!textItem) return null
                  return (
                    <button
                      key={previewText.id}
                      data-slideshow-text-editor="text-target"
                      className={cn(
                        "absolute cursor-text bg-transparent text-transparent",
                        selected &&
                          "border-2 border-[#4f91ff] bg-[#4f91ff]/5 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
                      )}
                      style={selectionBoxes[textIndex]}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectText(textIndex)
                      }}
                      aria-label="Edit text element"
                    >
                      {selected
                        ? [
                            "-top-1 -left-1",
                            "-top-1 -right-1",
                            "-bottom-1 -left-1",
                            "-right-1 -bottom-1",
                          ].map((position) => (
                            <span
                              key={position}
                              className={cn(
                                "absolute size-1.5 rounded-[1px] border border-white bg-[#4f91ff]",
                                position
                              )}
                            />
                          ))
                        : null}
                    </button>
                  )
                })
              : null}
            {!item.section.noText && onAddText ? (
              <button
                type="button"
                className="absolute right-2 bottom-2 left-2 z-20 flex items-center justify-center gap-1 rounded-md border border-dashed border-white/70 bg-black/20 py-1.5 text-[9px] font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/slide:opacity-100 focus:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  onAddText()
                }}
              >
                <Plus className="size-3" />
                Add text
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function textSelectionBoxes(
  slide: ReturnType<typeof previewSlideshowSlide>,
  aspectRatio: string
) {
  const dimensions = slideDimensions(aspectRatio)
  return renderedTextItemEditorBounds(
    slide.textItems,
    dimensions.width,
    dimensions.height
  ).map((bounds) => ({
    left: `${(bounds.left / dimensions.width) * 100}%`,
    top: `${(bounds.top / dimensions.height) * 100}%`,
    width: `${(bounds.width / dimensions.width) * 100}%`,
    height: `${(bounds.height / dimensions.height) * 100}%`,
  }))
}
