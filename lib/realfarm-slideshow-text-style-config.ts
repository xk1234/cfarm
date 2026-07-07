import type { CSSProperties } from "react"

export const slideshowTextFontOptions = [
  "Default",
  "Bebas Neue",
  "Elegance",
  "Elegance Italic",
] as const

export const slideshowTextColorOptions = [
  "Outline",
  "White Text",
  "Black Text",
  "Yellow Text",
  "White Background",
  "White 50% Background",
  "Black Background",
  "Black 50% Background",
  "Light Pink",
  "Muted Red",
  "Navy Blue",
] as const

export const slideshowTextSizeOptions = [
  "6px",
  "8px",
  "10px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
] as const

export const defaultSlideshowTextStyle = {
  font: "Default",
  color: "Yellow Text",
  size: "14px",
} as const

export const promptSlideshowTextStyle = {
  font: defaultSlideshowTextStyle.font,
  color: "Outline",
  size: "12px",
} as const

export function editorColorToTextStyle(color: string) {
  switch (color) {
    case "Yellow Text":
      return "yellowText"
    case "Black Text":
      return "blackText"
    case "White Background":
      return "whiteBackground"
    case "Black Background":
      return "blackBackground"
    case "Outline":
      return "outline"
    case "White Text":
    default:
      return "whiteText"
  }
}

export function textStyleToEditorColor(style: string) {
  switch (style) {
    case "yellowText":
    case "yellow-text":
      return "Yellow Text"
    case "blackText":
    case "black-text":
      return "Black Text"
    case "background":
    case "whiteBackground":
    case "white-background":
      return "White Background"
    case "blackBackground":
    case "black-background":
      return "Black Background"
    case "outline":
      return "Outline"
    case "whiteText":
    case "white-text":
    default:
      return "White Text"
  }
}

export function automationTextPreviewClassName(textStyle: string) {
  return textColorClass(textStyleToEditorColor(textStyle))
}

export function automationTextPreviewStyle(textItem: {
  font?: string
  fontSize?: string
  textStyle?: string
  textPosition?: "top" | "center" | "bottom" | string
  textAnchor?: "padded" | "flush" | string
  textItemWidth?: string
  textAlign?: "left" | "center" | "right" | string
}): CSSProperties {
  const font = textItem.font?.trim()
  const textAlign =
    textItem.textAlign === "left"
      ? "left"
      : textItem.textAlign === "right"
        ? "right"
        : "center"

  return {
    top:
      textItem.textPosition === "top" || textItem.textAnchor === "flush"
        ? "14%"
        : textItem.textPosition === "bottom"
          ? "72%"
          : "42%",
    width: textItem.textItemWidth || "74%",
    fontSize: textItem.fontSize || "11px",
    textAlign,
    fontFamily:
      font && font !== "Default" && font !== "TikTok Display Medium"
        ? `${font}, sans-serif`
        : undefined,
    textShadow:
      textItem.textStyle === "outline"
        ? "0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000"
        : undefined,
  }
}

export function textColorClass(color: string) {
  switch (color) {
    case "Black Text":
      return "text-black"
    case "Yellow Text":
      return "text-yellow-100"
    case "White Background":
      return "bg-white text-black"
    case "White 50% Background":
      return "bg-white/50 text-black"
    case "Black Background":
      return "bg-black text-white"
    case "Black 50% Background":
      return "bg-black/50 text-white"
    case "Outline":
    case "White Text":
    default:
      return "text-white"
  }
}

export function editorFontSizeToCanvasPx(value?: string) {
  const parsed = Number.parseFloat(value || "")
  return Number.isFinite(parsed)
    ? Math.max(28, Math.min(92, Math.round(parsed * 4.2)))
    : 52
}

export function textFillColor(color?: string) {
  switch (color) {
    case "Black Text":
      return "#111"
    case "Yellow Text":
      return "#fef08a"
    default:
      return "#fff"
  }
}

export function textStrokeColor(color?: string) {
  return color === "Black Text" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.82)"
}
