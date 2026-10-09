/**
 * Frame geometry (doc 01 §2.3): lengths, insets and anchor-positioned boxes.
 * Percentages resolve against the parent box: width for x/width/left/right,
 * height for y/height/top/bottom.
 */
import type { Box } from "../display-list"
import type { Anchor, Frame, Length } from "../spec"

export function resolveLength(value: Length | undefined, reference: number, fallback = 0): number {
  if (value === undefined) return fallback
  if (typeof value === "number") return value
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? (n / 100) * reference : fallback
}

/** [top, right, bottom, left] in px. */
export function resolveInsets(
  value: Length | [Length, Length, Length, Length] | undefined,
  width: number,
  height: number
): [number, number, number, number] {
  if (value === undefined) return [0, 0, 0, 0]
  if (Array.isArray(value)) {
    return [
      resolveLength(value[0], height),
      resolveLength(value[1], width),
      resolveLength(value[2], height),
      resolveLength(value[3], width),
    ]
  }
  return [
    resolveLength(value, height),
    resolveLength(value, width),
    resolveLength(value, height),
    resolveLength(value, width),
  ]
}

/** Fraction of the box that sits left/above the anchor point. */
export function anchorFactors(anchor: Anchor | undefined): { ax: number; ay: number } {
  switch (anchor ?? "top-left") {
    case "top-left":
      return { ax: 0, ay: 0 }
    case "top":
      return { ax: 0.5, ay: 0 }
    case "top-right":
      return { ax: 1, ay: 0 }
    case "left":
      return { ax: 0, ay: 0.5 }
    case "center":
      return { ax: 0.5, ay: 0.5 }
    case "right":
      return { ax: 1, ay: 0.5 }
    case "bottom-left":
      return { ax: 0, ay: 1 }
    case "bottom":
      return { ax: 0.5, ay: 1 }
    case "bottom-right":
      return { ax: 1, ay: 1 }
  }
}

/** A frame's size request before content measurement. `null` = "auto". */
export type FrameSize = { width: number | null; height: number | null }

/**
 * Size request of a frame inside a parent box of `parentW × parentH`.
 * Missing width/height default to 100% of the parent unless `autoDefault`
 * says that axis defaults to "auto" (text height, for example).
 */
export function frameSize(
  frame: Frame | undefined,
  parentW: number,
  parentH: number,
  autoDefault: { width?: boolean; height?: boolean } = {}
): FrameSize {
  if (frame?.inset !== undefined) {
    const [t, r, b, l] = resolveInsets(frame.inset, parentW, parentH)
    return { width: Math.max(0, parentW - l - r), height: Math.max(0, parentH - t - b) }
  }
  const w = frame?.width
  const h = frame?.height
  return {
    width: w === "auto" || (w === undefined && autoDefault.width) ? null : resolveLength(w, parentW, parentW),
    height: h === "auto" || (h === undefined && autoDefault.height) ? null : resolveLength(h, parentH, parentH),
  }
}

/** Places a box of `width × height` per the frame (insets win over x/y/anchor). */
export function placeFrame(
  frame: Frame | undefined,
  parentW: number,
  parentH: number,
  width: number,
  height: number
): Box {
  if (frame?.inset !== undefined) {
    const [t, , , l] = resolveInsets(frame.inset, parentW, parentH)
    return { x: l, y: t, width, height }
  }
  const { ax, ay } = anchorFactors(frame?.anchor)
  const x = resolveLength(frame?.x, parentW)
  const y = resolveLength(frame?.y, parentH)
  return { x: x - ax * width, y: y - ay * height, width, height }
}
