import type { ReactNode } from "react"
import { AlignCenter, AlignLeft, AlignRight, MapPin, Plus } from "lucide-react"

import { SelectLike } from "@/components/ui/form-controls"
import {
  alignmentLabel,
  anchorLabel,
  automationAlignments,
  automationAnchors,
  labelToAlignment,
  labelToAnchor,
  type AutomationTextItem,
} from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

export function AutomationFormatTextToolbar({
  mode,
  textItem,
  updateTextItem,
  onDelete,
  onAdd,
  layout = "floating",
}: {
  mode: "Hook" | "Content" | "CTA"
  textItem: AutomationTextItem
  updateTextItem: (patch: Partial<AutomationTextItem>) => void
  onDelete: () => void
  onAdd: () => void
  layout?: "floating" | "inline"
}) {
  return (
    <div
      className={cn(
        "flex-shrink-0 space-y-2.5 rounded-xl border-t border-[#E5E7EB] bg-[#F5F5F5] px-4 py-3 shadow-lg",
        layout === "floating"
          ? "absolute right-0 bottom-0 left-0 mx-4 mb-4"
          : "relative shadow-sm"
      )}
    >
      <div className="space-y-2.5">
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <CompactTextSelect
              label="Font"
              value={fontLabel(textItem.font)}
              options={automationFontLabels}
              onChange={(value) => updateTextItem({ font: labelToFont(value) })}
            />
            <CompactTextSelect
              label="Style"
              value={textStyleLabel(textItem.textStyle)}
              options={automationTextStyleLabels}
              onChange={(value) =>
                updateTextItem({ textStyle: labelToTextStyle(value) })
              }
            />
            <CompactTextSelect
              label="Size"
              value={textItem.fontSize || "8px"}
              options={automationFontSizes}
              onChange={(value) => updateTextItem({ fontSize: value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CompactTextSelect
              label="Position"
              value={textPositionLabel(textItem.textPosition)}
              options={automationTextPositionLabels}
              icon={<MapPin className="size-3.5" />}
              onChange={(value) =>
                updateTextItem({ textPosition: labelToTextPosition(value) })
              }
            />
            <CompactTextSelect
              label="Width"
              value={textItem.textItemWidth || "60%"}
              options={automationTextWidths}
              onChange={(value) => updateTextItem({ textItemWidth: value })}
            />
          </div>
          <div className="flex items-start gap-2">
            <CompactTextSelect
              label="Word length"
              value={wordRangeLabel(textItem)}
              options={automationWordRanges.map(wordRangeLabelFromTuple)}
              onChange={(value) => {
                const [wordLengthMin, wordLengthMax] = parseWordRange(value)
                updateTextItem({ wordLengthMin, wordLengthMax })
              }}
            />
            <CompactTextSelect
              label="Alignment"
              value={alignmentLabel(textItem.textAlign)}
              options={automationAlignments.map(alignmentLabel)}
              icon={alignmentIcon(textItem.textAlign)}
              onChange={(value) =>
                updateTextItem({ textAlign: labelToAlignment(value) })
              }
            />
          </div>
          <div className="flex gap-2">
            <CompactTextSelect
              label="Left/Right Padding"
              value={anchorLabel(textItem.textAnchor ?? "padded")}
              options={automationAnchors.map(anchorLabel)}
              icon={<MapPin className="size-3.5" />}
              onChange={(value) =>
                updateTextItem({ textAnchor: labelToAnchor(value) })
              }
            />
            <CompactTextSelect
              label="Top/Bottom Padding"
              value={anchorLabel(textItem.textVerticalAnchor ?? "padded")}
              options={automationAnchors.map(anchorLabel)}
              icon={<MapPin className="size-3.5" />}
              onChange={(value) =>
                updateTextItem({ textVerticalAnchor: labelToAnchor(value) })
              }
            />
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#242421]">
              Content direction
            </span>
            <textarea
              rows={2}
              className="w-full resize-none rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-medium outline-none placeholder:text-[#CCC] focus:border-[#999]"
              value={textItem.contentDirection ?? ""}
              onChange={(event) =>
                updateTextItem({ contentDirection: event.target.value })
              }
              placeholder={
                mode === "CTA"
                  ? "e.g. a short call to action..."
                  : "e.g. A bold hook about..."
              }
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="flex items-center gap-1 rounded-md p-1.5 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-50"
            onClick={onAdd}
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            Add text
          </button>
          <button
            className="rounded-md p-1.5 text-xs font-medium text-[#e65656] transition-colors hover:bg-red-50"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

const automationFontLabels = [
  "Default",
  "TikTok Display Medium",
  "Inter",
  "Arial",
]
const automationFontSizes = [
  "8px",
  "10px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "22px",
  "24px",
]
const automationWordRanges: Array<[number, number]> = [
  [2, 3],
  [5, 10],
  [10, 15],
  [15, 20],
  [20, 25],
  [25, 30],
]
const automationTextStyleOptions = [
  { label: "White Text", value: "whiteText" },
  { label: "Yellow Text", value: "yellowText" },
  { label: "Black Text", value: "blackText" },
  { label: "Background", value: "background" },
  { label: "Outline", value: "outline" },
]
const automationTextStyleLabels = automationTextStyleOptions.map(
  (option) => option.label
)
const automationTextPositions: AutomationTextItem["textPosition"][] = [
  "top",
  "center",
  "bottom",
]
const automationTextPositionLabels =
  automationTextPositions.map(textPositionLabel)
const automationTextWidths = ["40%", "50%", "60%", "70%", "80%", "90%", "100%"]

function wordRangeLabel(textItem: AutomationTextItem) {
  return `${textItem.wordLengthMin}-${textItem.wordLengthMax} words`
}

function wordRangeLabelFromTuple([minimum, maximum]: [number, number]) {
  return `${minimum}-${maximum} words`
}

function parseWordRange(value: string): [number, number] {
  const [minimum, maximum] = value.match(/\d+/g)?.map(Number) ?? [5, 10]
  return [minimum || 5, maximum || minimum || 10]
}

function fontLabel(value: string) {
  return value && value !== "TikTok Display Medium" ? value : "Default"
}

function labelToFont(value: string) {
  return value === "Default" ? "TikTok Display Medium" : value
}

function textStyleLabel(value: string) {
  return (
    automationTextStyleOptions.find((option) => option.value === value)
      ?.label ?? "White Text"
  )
}

function labelToTextStyle(value: string) {
  return (
    automationTextStyleOptions.find((option) => option.label === value)
      ?.value ?? "whiteText"
  )
}

function textPositionLabel(value: AutomationTextItem["textPosition"]) {
  return value[0].toUpperCase() + value.slice(1)
}

function labelToTextPosition(
  value: string
): AutomationTextItem["textPosition"] {
  const normalized = value.toLowerCase()
  return normalized === "top" || normalized === "bottom" ? normalized : "center"
}

function CompactTextSelect({
  label,
  value,
  options,
  icon,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  icon?: ReactNode
  onChange: (value: string) => void
}) {
  return (
    <label className="flex-1 space-y-1">
      <span className="block text-xs font-medium text-[#242421]">{label}</span>
      <span className="flex items-center gap-2">
        {icon && <span className="shrink-0 text-[#242421]">{icon}</span>}
        <span className="min-w-0 flex-1">
          <SelectLike
            value={value}
            options={options}
            onChange={onChange}
            placement="bottom"
          />
        </span>
      </span>
    </label>
  )
}

function alignmentIcon(alignment: AutomationTextItem["textAlign"]) {
  switch (alignment) {
    case "left":
      return <AlignLeft className="size-3.5" />
    case "right":
      return <AlignRight className="size-3.5" />
    default:
      return <AlignCenter className="size-3.5" />
  }
}
