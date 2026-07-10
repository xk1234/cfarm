import { renderedSlideSvg } from "@/lib/slideshow-renderer"
import { cn } from "@/lib/utils"

import {
  formatAspectRatioCss,
  formatPreviewCardSize,
  previewSlideshowSlide,
  type AutomationFormatPreviewItem,
} from "./format-helpers"

function FormatEmptyCollectionTile() {
  return (
    <div className="grid h-full place-items-center bg-[#deddd8] px-2 text-center text-[10px] font-semibold tracking-[0.04em] text-[#77766f] uppercase">
      Select collection
    </div>
  )
}

export function AutomationFormatPreviewCard({
  item,
  index,
  active,
  slotWidth,
  selectedText,
  onSelect,
  onSelectText,
}: {
  item: AutomationFormatPreviewItem
  index: number
  active: boolean
  slotWidth: number
  selectedText: boolean
  onSelect: () => void
  onSelectText: () => void
}) {
  const size = formatPreviewCardSize(item.section.aspect_ratio, item.image)
  const slide = previewSlideshowSlide(item, index)
  const overlayUrl = slide.overlayImage?.image_url
  const previewSvg = item.image
    ? renderedSlideSvg(slide, item.image.imageUrl, overlayUrl)
    : ""

  return (
    <div
      className={cn(
        "shrink-0 cursor-pointer transition-opacity duration-300",
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
      <div className="mx-auto mb-2 w-[148px] text-left text-[12px] font-bold text-[#77766f]">
        {item.label}
      </div>
      <div className="relative mx-auto grid h-[250px] w-[148px] place-items-center overflow-hidden rounded-[2px] bg-black shadow-sm">
        <div
          className="relative overflow-hidden bg-black"
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
          {!item.section.noText && item.text && (
            <button
              className={cn(
                "absolute inset-0 cursor-text bg-transparent text-transparent",
                selectedText && "outline outline-2 outline-[#4f91ff]"
              )}
              onClick={(event) => {
                event.stopPropagation()
                onSelectText()
              }}
              aria-label="Edit text element"
            />
          )}
          {selectedText && (
            <div className="absolute top-[58%] left-1/2 -translate-x-1/2 rounded-[4px] bg-white px-2 py-1 text-[11px] font-semibold text-[#242421] shadow-sm">
              Editing Text
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
