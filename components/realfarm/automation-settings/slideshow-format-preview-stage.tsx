import { AutomationFormatPreviewCard } from "./format-preview-card"
import { AutomationFormatTextToolbar } from "./format-text-toolbar"
import type { AutomationFormatPreviewItem } from "./format-helpers"
import type { AutomationTextItem } from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

type SlideshowFormatTab = "Hook" | "Content" | "CTA"

export function SlideshowFormatPreviewStage({
  previewItems,
  activeTab,
  activeTextItem,
  selectedTextIndex,
  activePreviewIndex,
  previewSlotWidths,
  previewGap,
  previewTrackOffset,
  zoom,
  onZoomChange,
  onSelectPreview,
  onSelectPreviewText,
  updateTextItem,
  onDeleteTextItem,
  onAddTextItem,
}: {
  previewItems: AutomationFormatPreviewItem[]
  activeTab: SlideshowFormatTab
  activeTextItem: AutomationTextItem
  selectedTextIndex: number | null
  activePreviewIndex: number
  previewSlotWidths: number[]
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
  updateTextItem: (patch: Partial<AutomationTextItem>) => void
  onDeleteTextItem: () => void
  onAddTextItem: () => void
}) {
  return (
    <main className="relative isolate min-h-0 min-w-0 overflow-hidden bg-[#b9b9b6]">
      <div
        className="absolute top-4 right-4 z-20 flex items-center rounded-[9px] border border-black/10 bg-white/92 p-1 shadow-sm backdrop-blur"
      >
        <button
          type="button"
          className="grid size-8 place-items-center rounded-[6px] text-[#565663] hover:bg-[#f0eef8] disabled:opacity-35"
          disabled={zoom <= 1}
          onClick={() => onZoomChange(Math.max(1, zoom - 0.25))}
          aria-label="Zoom out slideshow preview"
        >
          <IconMinus className="size-4" />
        </button>
        <span className="w-12 text-center text-xs font-semibold text-[#30303a] tabular-nums">
          {zoom.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")}×
        </span>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-[6px] text-[#565663] hover:bg-[#f0eef8] disabled:opacity-35"
          disabled={zoom >= 2}
          onClick={() => onZoomChange(Math.min(2, zoom + 0.25))}
          aria-label="Zoom in slideshow preview"
        >
          <IconPlus className="size-4" />
        </button>
      </div>
      <div className="h-full overflow-x-hidden overflow-y-auto pt-[168px]">
        <div
          className="flex items-start transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
          style={{
            columnGap: `${previewGap}px`,
            transform: `translateX(calc(50% - ${previewTrackOffset}px))`,
          }}
        >
          {previewItems.map((item, index) => (
            <AutomationFormatPreviewCard
              key={item.id}
              item={item}
              index={index}
              active={activePreviewIndex === index}
              slotWidth={previewSlotWidths[index]}
              zoom={zoom}
              compact={false}
              selectedTextIndex={
                activePreviewIndex === index ? selectedTextIndex : null
              }
              onSelect={() => onSelectPreview(index, item.tab)}
              onSelectText={(textIndex) =>
                onSelectPreviewText(index, item.tab, textIndex)
              }
              onAddText={
                activePreviewIndex === index ? onAddTextItem : undefined
              }
            />
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-1.5">
          {previewItems.map((item, index) => (
            <button
              key={item.id}
              className={cn(
                "size-2 rounded-full",
                index === activePreviewIndex ? "bg-white" : "bg-white/55"
              )}
              onClick={() => onSelectPreview(index, item.tab)}
              aria-label={`Select preview ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {selectedTextIndex !== null && (
        <AutomationFormatTextToolbar
          mode={activeTab}
          textItem={activeTextItem}
          updateTextItem={updateTextItem}
          onDelete={onDeleteTextItem}
          onAdd={onAddTextItem}
        />
      )}
    </main>
  )
}
import { IconMinus, IconPlus } from "@tabler/icons-react"
