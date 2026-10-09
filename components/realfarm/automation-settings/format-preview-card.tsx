import type { AutomationTextItem } from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"
import { LuPlus } from "react-icons/lu"

import { FabricSlideshowCanvas } from "../fabric-slideshow-canvas"

import {
  formatAspectRatioCss,
  formatPreviewCardSize,
  fabricTextTransformPatch,
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
  selectedTextIndex: number | null
  onSelect: () => void
  onSelectText: (index: number) => void
  onClearTextSelection: () => void
  onTransformText: (index: number, patch: Partial<AutomationTextItem>) => void
  onAddText?: () => void
}) {
  const previewBaseScale = 2.5
  const displayScale = compact ? 1 : previewBaseScale * zoom
  const size = formatPreviewCardSize(item.section.aspect_ratio, item.image)
  const slide = previewSlideshowSlide(item, index)
  const aspectRatio = previewSlideshowAspectRatio(item)
  const font = previewSlideshowFont(item)
  const overlayUrl = slide.overlayImage?.image_url
  const iconUrls = slide.iconLayout?.surrounding.map((icon) => icon.image_url)

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
              <FabricSlideshowCanvas
                slide={slide}
                sourceUrl={item.image.imageUrl}
                overlayUrl={overlayUrl}
                aspectRatio={aspectRatio}
                font={font}
                iconUrls={iconUrls}
                label={`${item.label} slideshow preview`}
                editable={active && !item.section.noText && Boolean(item.text)}
                selectedTextIndex={selectedTextIndex}
                onSelectText={onSelectText}
                onClearTextSelection={onClearTextSelection}
                onTextTransform={(textIndex, transform) =>
                  onTransformText(
                    textIndex,
                    fabricTextTransformPatch({
                      ...transform,
                      textAlign: item.textItems[textIndex]?.textAlign,
                    })
                  )
                }
              />
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
