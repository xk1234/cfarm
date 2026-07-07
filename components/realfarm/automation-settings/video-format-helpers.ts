import type { CSSProperties } from "react"

import type { AutomationTextItem } from "@/lib/realfarm-automation"

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
  const top =
    textItem.textPosition === "bottom"
      ? "78%"
      : textItem.textPosition === "center"
        ? "46%"
        : "10%"
  const textAlign = textItem.textAlign || "center"
  const width = textItem.textItemWidth || "70%"
  const left =
    textAlign === "left" ? "10%" : textAlign === "right" ? "90%" : "50%"
  const transform =
    textAlign === "left"
      ? "translateY(-50%)"
      : textAlign === "right"
        ? "translate(-100%, -50%)"
        : "translate(-50%, -50%)"

  return {
    top,
    left,
    width,
    transform,
    fontSize: textItem.fontSize || "14px",
    textAlign,
    color: textItem.textStyle === "yellowText" ? "#fff176" : "#ffffff",
    backgroundColor:
      textItem.textStyle === "background" ? "#00000099" : "transparent",
    WebkitTextStroke:
      textItem.textStyle === "blackText" ? undefined : "0.5px rgba(0,0,0,0.85)",
  } satisfies CSSProperties
}
