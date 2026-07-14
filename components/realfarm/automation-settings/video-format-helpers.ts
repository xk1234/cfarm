import type { CSSProperties } from "react"

import type { AutomationTextItem } from "@/lib/realfarm-automation"
import {
  editorFontSizeToCanvasPx,
  textFillColor,
  textStrokeColor,
  textStyleToEditorColor,
  textStyleUsesStroke,
} from "@/lib/realfarm-slideshow-text-style-config"

const VIDEO_CANVAS_WIDTH = 720
const VIDEO_CANVAS_HEIGHT = 1280

export function textPlacementFromItem(
  textItem: Pick<AutomationTextItem, "textPosition">
): "top" | "middle" | "bottom" {
  if (textItem.textPosition === "top") {
    return "top"
  }
  if (textItem.textPosition === "bottom") {
    return "bottom"
  }
  return "middle"
}

export function pickRandomHook(hooks: string[], fallback: string) {
  if (hooks.length === 0) {
    return fallback
  }
  return hooks[Math.floor(Math.random() * hooks.length)]
}

export function videoAutomationPreviewTextStyle(textItem: AutomationTextItem) {
  const canvasY =
    textItem.textPosition === "bottom"
      ? 930
      : textItem.textPosition === "center"
        ? 430
        : 190
  const textAlign = textItem.textAlign || "center"
  const parsedWidth = Number(textItem.textItemWidth?.replace("%", ""))
  const width = `${Number.isFinite(parsedWidth) && parsedWidth > 0 ? Math.max(20, Math.min(100, parsedWidth)) : 84}%`
  const left =
    textAlign === "left" ? "12%" : textAlign === "right" ? "88%" : "50%"
  const transform =
    textAlign === "left"
      ? "translateY(-50%)"
      : textAlign === "right"
        ? "translate(-100%, -50%)"
        : "translate(-50%, -50%)"
  const canvasFontSize = Math.max(
    34,
    editorFontSizeToCanvasPx(textItem.fontSize) * 1.45
  )
  const editorColor = textStyleToEditorColor(textItem.textStyle || "outline")
  const strokeWidth = Math.max(7, Math.round(canvasFontSize * 0.15))

  return {
    top: `${(canvasY / VIDEO_CANVAS_HEIGHT) * 100}%`,
    left,
    width,
    transform,
    fontSize: `${(canvasFontSize / VIDEO_CANVAS_WIDTH) * 100}cqw`,
    lineHeight: 1.16,
    fontWeight: 900,
    textAlign,
    color: textFillColor(editorColor),
    backgroundColor: "transparent",
    WebkitTextStroke: textStyleUsesStroke(editorColor)
      ? `${(strokeWidth / VIDEO_CANVAS_WIDTH) * 100}cqw ${textStrokeColor(editorColor)}`
      : undefined,
  } satisfies CSSProperties
}

export function videoAutomationPreviewTextHighlightStyle(
  textItem: AutomationTextItem
) {
  const editorColor = textStyleToEditorColor(textItem.textStyle || "outline")
  const backgroundColor =
    editorColor === "Black Background"
      ? "#000000eb"
      : editorColor === "Black 50% Background"
        ? "#00000080"
        : editorColor === "White Background"
          ? "#ffffffeb"
          : editorColor === "White 50% Background"
            ? "#ffffff8c"
            : undefined

  if (!backgroundColor) return undefined

  return {
    backgroundColor,
    borderRadius: "0.12em",
    padding: "0.04em 0.18em 0.08em",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  } satisfies CSSProperties
}
