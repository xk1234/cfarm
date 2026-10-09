/**
 * Renderer-neutral display list (doc 01 §2.1/§7.1): the output of layout and
 * the only input of the painter. Every geometric value is a resolved pixel in
 * canvas space at scale 1.
 *
 * Coordinates: each node's `box` is in its parent's coordinate space (the
 * slide for top-level nodes, the group's box origin for children). Rotation is
 * about the box centre. Isomorphic.
 */
import type {
  ImageFilters,
  ResolvedImageSource,
  ResolvedPaint,
  ResolvedStroke,
  Shadow,
} from "./spec"

export type Box = { x: number; y: number; width: number; height: number }

export type NodeBase = {
  /** Layer id (unique within its slide). */
  id: string
  box: Box
  /** Degrees, about the box centre. */
  rotation: number
  opacity: number
  /** Drop shadow of the whole node. */
  shadow?: Shadow
}

export type RectNode = NodeBase & {
  kind: "rect"
  fill?: ResolvedPaint
  stroke?: ResolvedStroke
  cornerRadius: number
}

export type EllipseNode = NodeBase & {
  kind: "ellipse"
  fill?: ResolvedPaint
  stroke?: ResolvedStroke
}

/** A line from the box's top-left to its bottom-right. */
export type LineNode = NodeBase & {
  kind: "line"
  stroke: ResolvedStroke
}

/** Where the source pixels land inside the image box (box-local px). */
export type ImagePlacement = {
  /** Source rect in intrinsic pixels. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination rect in box-local pixels. */
  dx: number
  dy: number
  dw: number
  dh: number
}

export type ImageNode = NodeBase & {
  kind: "image"
  /** Key into the decoded asset map (see `imageSourceKey`). */
  assetKey: string
  source: ResolvedImageSource
  placement: ImagePlacement
  intrinsic: { width: number; height: number }
  clip: "rect" | "ellipse"
  cornerRadius: number
  border?: ResolvedStroke
  backdrop?: ResolvedPaint
  filters?: ImageFilters
  flipX: boolean
  flipY: boolean
}

/** One glyph run on one line, positioned at its baseline (box-local px). */
export type TextRunPaint = {
  text: string
  x: number
  baseline: number
  width: number
  /** Canvas font shorthand (`"800 64px \"Inter\""`). */
  font: string
  fontSize: number
  /**
   * Per-glyph offsets from `x`, present when letter spacing is non-zero
   * (glyphs are then drawn one by one so both platforms space identically).
   */
  glyphs?: { text: string; dx: number }[]
  /** Solid colour or gradient; gradients span the text node's box. */
  fill: ResolvedPaint
  stroke?: ResolvedStroke
  shadow?: Shadow
  underline: boolean
  syntheticItalic: boolean
}

export type TextBackgroundPaint = {
  x: number
  y: number
  width: number
  height: number
  radius: number
  color: string
  opacity: number
}

export type TextNode = NodeBase & {
  kind: "text"
  backgrounds: TextBackgroundPaint[]
  runs: TextRunPaint[]
  /** True when the content was clipped to the box (overflow clip/shrink). */
  clipToBox: boolean
}

export type GroupNode = NodeBase & {
  kind: "group"
  background?: ResolvedPaint
  clip: boolean
  cornerRadius: number
  children: DisplayNode[]
}

export type DisplayNode = RectNode | EllipseNode | LineNode | ImageNode | TextNode | GroupNode

export type DisplaySlide = {
  index: number
  id: string
  width: number
  height: number
  background: ResolvedPaint
  nodes: DisplayNode[]
}

/** Stable key for an image source; identical sources are fetched/decoded once per render. */
export function imageSourceKey(source: ResolvedImageSource): string {
  return "media" in source ? `media:${source.media}` : `url:${source.url}`
}
