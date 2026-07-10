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
  previewSlotWidth,
  previewGap,
  previewTrackOffset,
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
  previewSlotWidth: number
  previewGap: number
  previewTrackOffset: number
  onSelectPreview: (index: number, tab: SlideshowFormatTab) => void
  onSelectPreviewText: (index: number, tab: SlideshowFormatTab) => void
  updateTextItem: (patch: Partial<AutomationTextItem>) => void
  onDeleteTextItem: () => void
  onAddTextItem: () => void
}) {
  return (
    <main className="relative min-h-0 overflow-hidden bg-[#b9b9b6]">
      <div
        className={cn(
          "overflow-hidden",
          selectedTextIndex !== null
            ? "h-[315px] pt-[92px]"
            : "h-full pt-[168px]"
        )}
      >
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
              slotWidth={previewSlotWidth}
              selectedText={
                selectedTextIndex !== null && activePreviewIndex === index
              }
              onSelect={() => onSelectPreview(index, item.tab)}
              onSelectText={() => onSelectPreviewText(index, item.tab)}
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
