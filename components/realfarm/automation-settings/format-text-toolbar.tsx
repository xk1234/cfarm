import type { ReactNode } from "react"
import {
  LuAlignCenter,
  LuAlignLeft,
  LuAlignRight,
  LuPlus,
} from "react-icons/lu"

import { SelectLike } from "@/components/ui/form-controls"
import {
  AUTOMATION_FONT_OPTIONS,
  automationFontPreviewFamily,
} from "@/lib/automation-font-options"
import {
  alignmentLabel,
  automationAlignments,
  labelToAlignment,
  type TextItem,
} from "@/lib/realfarm-automation"
import { cn } from "@/lib/utils"

export function AutomationFormatTextToolbar({
  mode,
  textItem,
  updateTextItem,
  onDelete,
  onAdd,
  layout = "floating",
  locked = false,
}: {
  mode: "Hook" | "Content" | "CTA"
  textItem: TextItem
  updateTextItem: (patch: Partial<TextItem>) => void
  onDelete: () => void
  onAdd: () => void
  layout?: "floating" | "inline"
  locked?: boolean
}) {
  return (
    <div
      role={layout === "floating" ? "dialog" : undefined}
      aria-label={layout === "floating" ? "Text styling" : undefined}
      data-slideshow-text-editor={layout === "floating" ? "toolbar" : undefined}
      className={cn(
        "flex-shrink-0 space-y-2.5 rounded-xl bg-[#F5F5F5] px-4 py-3 shadow-lg",
        layout === "floating"
          ? "absolute right-4 bottom-4 left-4 z-30 w-auto border border-app-panel-border"
          : "relative border-t border-app-panel-border shadow-sm"
      )}
    >
      {locked ? (
        <div className="rounded-lg border border-[#dddcd4] bg-white/70 px-2.5 py-2 text-[11px] font-medium text-app-muted-text">
          Preset layout is locked. Content direction stays editable.
        </div>
      ) : null}
      <div className="space-y-2.5">
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <CompactTextSelect
              label="Style"
              value={textStyleLabel(
                textItem.textStyle,
                textItem.backgroundMode
              )}
              options={automationTextStyleLabels}
              renderValue={textStylePreview}
              renderOption={textStylePreview}
              disabled={locked}
              onChange={(value) => updateTextItem(textStylePatch(value))}
            />
            <CompactTextSelect
              label="Font"
              value={textItem.font || AUTOMATION_FONT_OPTIONS[0]}
              options={[...AUTOMATION_FONT_OPTIONS]}
              renderValue={fontPreview}
              renderOption={fontPreview}
              disabled={locked}
              onChange={(value) => updateTextItem({ font: value })}
            />
            <CompactTextSelect
              label="Weight"
              value={`${textItem.fontWeight ?? 800}`}
              options={automationFontWeights}
              renderValue={fontWeightPreview}
              renderOption={fontWeightPreview}
              disabled={locked}
              onChange={(value) =>
                updateTextItem({ fontWeight: Number(value) || 800 })
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <CompactTextSelect
              label="Size"
              value={textItem.fontSize || "8px"}
              options={automationFontSizes}
              renderValue={fontSizePreview}
              renderOption={fontSizePreview}
              disabled={locked}
              onChange={(value) => updateTextItem({ fontSize: value })}
            />
            <CompactTextSelect
              label="Width"
              value={textItem.textItemWidth || "60%"}
              options={automationTextWidths}
              renderValue={textWidthPreview}
              renderOption={textWidthPreview}
              disabled={locked}
              onChange={(value) => updateTextItem({ textItemWidth: value })}
            />
            <CompactTextSelect
              label="Words"
              value={wordRangeLabel(textItem)}
              options={automationWordRanges.map(wordRangeLabelFromTuple)}
              renderValue={wordDensityPreview}
              renderOption={wordDensityPreview}
              disabled={locked}
              onChange={(value) => {
                const [wordLengthMin, wordLengthMax] = parseWordRange(value)
                updateTextItem({ wordLengthMin, wordLengthMax })
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <CompactTextSelect
              label="X position"
              value={positionPercentLabel(textItem.positionX ?? 50)}
              options={positionPercentOptions(textItem.positionX ?? 50, "x")}
              renderValue={(value) => positionPreview(value, "horizontal")}
              renderOption={(value) => positionPreview(value, "horizontal")}
              disabled={locked}
              onChange={(value) =>
                updateTextItem({ positionX: parsePositionPercent(value) })
              }
            />
            <CompactTextSelect
              label="Y position"
              value={positionPercentLabel(textItem.positionY ?? 45)}
              options={positionPercentOptions(textItem.positionY ?? 45, "y")}
              renderValue={(value) => positionPreview(value, "vertical")}
              renderOption={(value) => positionPreview(value, "vertical")}
              disabled={locked}
              onChange={(value) => {
                const positionY = parsePositionPercent(value)
                updateTextItem({
                  positionY,
                  textPosition:
                    positionY <= 25
                      ? "top"
                      : positionY >= 70
                        ? "bottom"
                        : "center",
                })
              }}
            />
            <CompactTextSelect
              label="Alignment"
              value={alignmentLabel(textItem.textAlign)}
              options={automationAlignments.map(alignmentLabel)}
              renderValue={alignmentPreview}
              renderOption={alignmentPreview}
              disabled={locked}
              onChange={(value) =>
                updateTextItem({ textAlign: labelToAlignment(value) })
              }
            />
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-app-text">
              Content direction
            </span>
            <textarea
              rows={2}
              className="w-full resize-none rounded-lg border border-app-panel-border bg-app-surface px-2.5 py-1.5 text-xs font-medium outline-none placeholder:text-[#CCC] focus:border-[#999]"
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
        {!locked ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              className="flex items-center gap-1 rounded-md p-1.5 text-xs font-medium text-blue-500 transition-colors hover:bg-blue-50"
              onClick={onAdd}
            >
              <LuPlus className="size-3.5 stroke-[2.5]" />
              Add text
            </button>
            <button
              className="rounded-md p-1.5 text-xs font-medium text-[#e65656] transition-colors hover:bg-red-50"
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

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
const automationFontWeights = ["400", "500", "600", "700", "800", "900"]
const automationWordRanges: Array<[number, number]> = [
  [2, 3],
  [5, 10],
  [10, 15],
  [15, 20],
  [20, 25],
  [25, 30],
]
const automationTextStyleOptions: Array<{
  label: string
  value: string
  backgroundMode?: TextItem["backgroundMode"]
}> = [
  { label: "White Text", value: "whiteText" },
  { label: "Yellow Text", value: "yellowText" },
  { label: "Black Text", value: "blackText" },
  { label: "Background", value: "background", backgroundMode: "line" },
  { label: "White card", value: "background", backgroundMode: "block" },
  { label: "Dark Background", value: "black50Background" },
  { label: "Outline", value: "outline" },
]
const automationTextStyleLabels = automationTextStyleOptions.map(
  (option) => option.label
)
const automationTextWidths = ["40%", "50%", "60%", "70%", "80%", "90%", "100%"]

function wordRangeLabel(textItem: TextItem) {
  return `${textItem.wordLengthMin}-${textItem.wordLengthMax} words`
}

function wordRangeLabelFromTuple([minimum, maximum]: [number, number]) {
  return `${minimum}-${maximum} words`
}

function parseWordRange(value: string): [number, number] {
  const [minimum, maximum] = value.match(/\d+/g)?.map(Number) ?? [5, 10]
  return [minimum || 5, maximum || minimum || 10]
}

function textStyleLabel(
  value: string,
  backgroundMode: TextItem["backgroundMode"]
) {
  return (
    automationTextStyleOptions.find(
      (option) =>
        option.value === value &&
        (option.backgroundMode === undefined ||
          option.backgroundMode === backgroundMode)
    )?.label ?? "White Text"
  )
}

function textStylePatch(value: string): Partial<TextItem> {
  const option = automationTextStyleOptions.find(
    (candidate) => candidate.label === value
  )
  return {
    textStyle: option?.value ?? "whiteText",
    backgroundMode: option?.backgroundMode ?? "line",
    ...(option?.backgroundMode === "block" ? { backgroundRadius: 14 } : {}),
  }
}

function CompactTextSelect({
  label,
  value,
  options,
  renderValue,
  renderOption,
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  renderValue?: (value: string) => ReactNode
  renderOption?: (value: string) => ReactNode
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex-1 space-y-1">
      <span className="block text-xs font-medium text-app-text">{label}</span>
      <SelectLike
        value={value}
        options={options}
        onChange={onChange}
        placement="bottom"
        renderValue={renderValue}
        renderOption={renderOption}
        disabled={disabled}
      />
    </label>
  )
}

function fontPreview(value: string) {
  const fontFamily = automationFontPreviewFamily(value)
  return <span style={{ fontFamily }}>{value}</span>
}

function fontSizePreview(value: string) {
  const configuredSize = Number.parseInt(value, 10)
  const fontSize = `${Math.max(11, Math.min(18, configuredSize))}px`
  return <span style={{ fontSize }}>{value}</span>
}

function fontWeightPreview(value: string) {
  return <span style={{ fontWeight: Number(value) }}>{value}</span>
}

function textStylePreview(label: string) {
  const style = textStylePatch(label).textStyle
  return (
    <OptionPreview label={label}>
      <span
        className={cn(
          "inline-flex h-5 w-8 items-center justify-center overflow-hidden rounded text-[10px] font-black",
          style === "whiteText" && "bg-neutral-700 text-white",
          style === "yellowText" && "bg-neutral-700 text-yellow-300",
          style === "blackText" &&
            "border border-neutral-300 bg-white text-black",
          style === "background" && "bg-neutral-300 text-black",
          style === "black50Background" && "bg-neutral-300 text-white",
          style === "outline" &&
            "bg-gradient-to-br from-fuchsia-400 to-indigo-500 text-white"
        )}
      >
        {style === "background" ? (
          <span className="bg-white px-0.5 text-black">Aa</span>
        ) : style === "black50Background" ? (
          <span className="bg-black/60 px-0.5 text-white">Aa</span>
        ) : (
          <span
            style={
              style === "outline"
                ? {
                    WebkitTextStroke: "0.6px #111",
                    textShadow: "0 1px 1px rgb(0 0 0 / 0.65)",
                  }
                : undefined
            }
          >
            Aa
          </span>
        )}
      </span>
    </OptionPreview>
  )
}

function textWidthPreview(value: string) {
  return (
    <OptionPreview label={value}>
      <span className="flex h-5 w-8 items-center rounded border border-app-panel-border-strong px-0.5">
        <span
          className="mx-auto h-1 rounded-full bg-app-text"
          style={{ width: value }}
        />
      </span>
    </OptionPreview>
  )
}

function wordDensityPreview(value: string) {
  const maximum = Number(value.match(/\d+/g)?.at(-1) ?? 10)
  const lines = maximum <= 3 ? 1 : maximum <= 10 ? 2 : 3
  return (
    <OptionPreview label={value}>
      <span className="flex h-5 w-8 flex-col justify-center gap-0.5 rounded border border-app-panel-border-strong px-1">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className="h-0.5 rounded-full bg-app-text"
            style={{ width: index === lines - 1 && lines > 1 ? "68%" : "100%" }}
          />
        ))}
      </span>
    </OptionPreview>
  )
}

function positionPercentLabel(value: number) {
  return `${Math.round(value)}%`
}

function parsePositionPercent(value: string) {
  return Math.max(0, Math.min(100, Number.parseFloat(value) || 0))
}

function positionPercentOptions(current: number, axis: "x" | "y"): string[] {
  const presetValues =
    axis === "x"
      ? [10, 20, 25, 29, 35, 50, 62, 75, 90]
      : [10, 16, 20, 29, 38, 45, 47, 51, 62, 65, 75, 82, 90]
  return [...new Set([...presetValues, Math.round(current)])]
    .sort((a, b) => a - b)
    .map(positionPercentLabel)
}

function positionPreview(value: string, axis: "horizontal" | "vertical") {
  const position = parsePositionPercent(value)
  return (
    <OptionPreview label={value}>
      <span className="relative h-5 w-7 rounded border border-app-panel-border-strong">
        <span
          className={cn(
            "absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-text",
            axis === "horizontal" ? "top-1/2" : "left-1/2"
          )}
          style={
            axis === "horizontal"
              ? { left: `${position}%` }
              : { top: `${position}%` }
          }
        />
      </span>
    </OptionPreview>
  )
}

function alignmentPreview(value: string) {
  const alignment = labelToAlignment(value)
  return <OptionPreview label={value}>{alignmentIcon(alignment)}</OptionPreview>
}

function OptionPreview({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="shrink-0">
        {children}
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

function alignmentIcon(alignment: TextItem["textAlign"]) {
  switch (alignment) {
    case "left":
      return <LuAlignLeft className="size-4" />
    case "right":
      return <LuAlignRight className="size-4" />
    default:
      return <LuAlignCenter className="size-4" />
  }
}
