import type {
  AutomationAspectRatio,
  AutomationImageGrid,
  AutomationTextAlign,
  AutomationTextAnchor,
} from "@/lib/automation-base-contract"

export function labelToAspectRatio(value: string): AutomationAspectRatio {
  return value as AutomationAspectRatio
}

export function aspectRatioLabel(value: AutomationAspectRatio) {
  return value
}

export function labelToImageGrid(value: string): AutomationImageGrid {
  if (value === "None") return "none"
  if (value === "Oval icons") return "oval-icons"
  return value as AutomationImageGrid
}

export function imageGridLabel(value: AutomationImageGrid) {
  if (value === "none") return "None"
  if (value === "oval-icons") return "Oval icons"
  return value
}

export function wordLengthLabel(value: number) {
  return `${value} words`
}

export function labelToWordLength(value: string) {
  return Number(value.replace(" words", "")) || 5
}

export function alignmentLabel(value: AutomationTextAlign) {
  return `${value[0].toUpperCase()}${value.slice(1)} align`
}

export function labelToAlignment(value: string): AutomationTextAlign {
  return value.toLowerCase().replace(" align", "") as AutomationTextAlign
}

export function anchorLabel(value: AutomationTextAnchor) {
  return value[0].toUpperCase() + value.slice(1)
}

export function labelToAnchor(value: string): AutomationTextAnchor {
  return value.toLowerCase() as AutomationTextAnchor
}
