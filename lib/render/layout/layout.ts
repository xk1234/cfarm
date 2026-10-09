/**
 * Slide layout (doc 01 §2.3): ResolvedSlide → DisplaySlide. Pure TypeScript;
 * text is measured through a TextMeasurer and images through their decoded
 * intrinsic sizes. No implicit heuristics: no auto-stacking, safe margins or
 * clamps — every position comes from the spec.
 */
import {
  imageSourceKey,
  type Box,
  type DisplayNode,
  type DisplaySlide,
  type GroupNode,
  type ImageNode,
  type NodeBase,
} from "../display-list"
import {
  jsonPointer,
  type ResolvedGroupLayer,
  type ResolvedImageLayer,
  type ResolvedLayer,
  type ResolvedShapeLayer,
  type ResolvedSlide,
  type ResolvedTextLayer,
  type SpecIssue,
} from "../spec"
import { frameSize, placeFrame, resolveInsets, resolveLength } from "./frame"
import { fitImage } from "./image"
import type { TextMeasurer } from "./measure"
import { layoutText } from "./text"

export type LayoutEnv = {
  measurer: TextMeasurer
  /** Intrinsic size of a decoded image by `imageSourceKey`, or null when unavailable. */
  imageSize(key: string): { width: number; height: number } | null
}

export type SlideLayoutResult = {
  slide: DisplaySlide
  errors: SpecIssue[]
  warnings: SpecIssue[]
}

type Ctx = LayoutEnv & { slideIndex: number; errors: SpecIssue[]; warnings: SpecIssue[] }

/** A layer sized inside its parent, ready to be placed. */
type Prepared = { width: number; height: number; build(box: Box): DisplayNode | null }

type SizeOverride = { width?: number; height?: number }

export function layoutSlide(
  slide: ResolvedSlide,
  slideIndex: number,
  canvas: { width: number; height: number },
  env: LayoutEnv
): SlideLayoutResult {
  const ctx: Ctx = { ...env, slideIndex, errors: [], warnings: [] }
  const nodes = layoutChildren(ctx, slide.layers, canvas.width, canvas.height, { x: 0, y: 0 }, ["slides", slideIndex, "layers"])
  return {
    slide: { index: slideIndex, id: slide.id, width: canvas.width, height: canvas.height, background: slide.background, nodes },
    errors: ctx.errors,
    warnings: ctx.warnings,
  }
}

/** Absolute layout of `layers` in a parent content box; returns nodes in paint order. */
function layoutChildren(
  ctx: Ctx,
  layers: ResolvedLayer[],
  width: number,
  height: number,
  origin: { x: number; y: number },
  path: (string | number)[]
): DisplayNode[] {
  const placed: { node: DisplayNode; z: number; i: number }[] = []
  layers.forEach((layer, i) => {
    const prepared = prepare(ctx, layer, width, height, [...path, i])
    const box = placeFrame(layer.frame, width, height, prepared.width, prepared.height)
    const node = prepared.build({ ...box, x: box.x + origin.x, y: box.y + origin.y })
    if (node) placed.push({ node, z: layer.z ?? 0, i })
  })
  return paintOrder(placed)
}

function paintOrder(placed: { node: DisplayNode; z: number; i: number }[]): DisplayNode[] {
  return placed.sort((a, b) => a.z - b.z || a.i - b.i).map((p) => p.node)
}

function base(layer: ResolvedLayer, box: Box): NodeBase {
  return {
    id: layer.id,
    box,
    rotation: layer.rotation ?? 0,
    opacity: layer.opacity ?? 1,
    ...(layer.shadow ? { shadow: layer.shadow } : {}),
  }
}

function issue(ctx: Ctx, list: "errors" | "warnings", code: SpecIssue["code"], path: (string | number)[], message: string): void {
  ctx[list].push({ code, path: jsonPointer(path), message, slide: ctx.slideIndex })
}

function prepare(
  ctx: Ctx,
  layer: ResolvedLayer,
  parentW: number,
  parentH: number,
  path: (string | number)[],
  override: SizeOverride = {}
): Prepared {
  switch (layer.type) {
    case "text":
      return prepareText(ctx, layer, parentW, parentH, path, override)
    case "image":
      return prepareImage(ctx, layer, parentW, parentH, path, override)
    case "shape":
      return prepareShape(layer, parentW, parentH, override)
    case "group":
      return prepareGroup(ctx, layer, parentW, parentH, path, override)
  }
}

// ───────────────────────────── text ─────────────────────────────

function prepareText(
  ctx: Ctx,
  layer: ResolvedTextLayer,
  parentW: number,
  parentH: number,
  path: (string | number)[],
  override: SizeOverride
): Prepared {
  const req = frameSize(layer.frame, parentW, parentH, { height: true })
  const width = override.width ?? req.width
  const height = override.height ?? req.height
  const result = layoutText({ layer, width, maxWidth: Math.max(1, parentW), height }, ctx.measurer)
  for (const i of result.issues) issue(ctx, i.severity === "error" ? "errors" : "warnings", i.code, path, i.message)
  return {
    width: result.width,
    height: result.height,
    build: (box) => ({
      ...base(layer, box),
      kind: "text",
      runs: result.runs,
      backgrounds: result.backgrounds,
      clipToBox: result.clipToBox,
    }),
  }
}

// ───────────────────────────── image ─────────────────────────────

function prepareImage(
  ctx: Ctx,
  layer: ResolvedImageLayer,
  parentW: number,
  parentH: number,
  path: (string | number)[],
  override: SizeOverride
): Prepared {
  const key = imageSourceKey(layer.src)
  const intrinsic = ctx.imageSize(key)
  const req = frameSize(layer.frame, parentW, parentH)
  let width = override.width ?? req.width
  let height = override.height ?? req.height
  if (intrinsic) {
    const aspect = intrinsic.height / Math.max(1, intrinsic.width)
    if (width === null && height === null) width = parentW
    if (height === null) height = (width ?? parentW) * aspect
    if (width === null) width = height / Math.max(1e-6, aspect)
  }
  const w = width ?? parentW
  const h = height ?? parentH
  return {
    width: w,
    height: h,
    build: (box): ImageNode | null => {
      if (!intrinsic) {
        issue(ctx, "errors", "asset.fetch_failed", [...path, "src"], `Image for layer "${layer.id}" could not be loaded.`)
        return null
      }
      const fit = fitImage(intrinsic, box, layer.fit, layer.focal, layer.zoom)
      if (layer.fit === "cover" && fit.scale > 2) {
        issue(
          ctx,
          "warnings",
          "asset.upscaled",
          [...path, "src"],
          `Image in layer "${layer.id}" is upscaled ${Math.round(fit.scale * 10) / 10}× to cover its box.`
        )
      }
      const { scale: _scale, ...placement } = fit
      return {
        ...base(layer, box),
        kind: "image",
        assetKey: key,
        source: layer.src,
        placement,
        intrinsic,
        clip: layer.clip ?? "rect",
        cornerRadius: layer.cornerRadius === undefined ? 0 : resolveLength(layer.cornerRadius, Math.min(box.width, box.height)),
        ...(layer.border && layer.border.width > 0 ? { border: layer.border } : {}),
        ...(layer.backdrop !== undefined ? { backdrop: layer.backdrop } : {}),
        ...(layer.filters ? { filters: layer.filters } : {}),
        flipX: !!layer.flipX,
        flipY: !!layer.flipY,
      }
    },
  }
}

// ───────────────────────────── shape ─────────────────────────────

function prepareShape(layer: ResolvedShapeLayer, parentW: number, parentH: number, override: SizeOverride): Prepared {
  const req = frameSize(layer.frame, parentW, parentH)
  const width = override.width ?? req.width ?? parentW
  const height = override.height ?? req.height ?? parentH
  return {
    width,
    height,
    build: (box): DisplayNode => {
      const b = base(layer, box)
      if (layer.shape === "ellipse") {
        return { ...b, kind: "ellipse", ...(layer.fill !== undefined ? { fill: layer.fill } : {}), ...(layer.stroke ? { stroke: layer.stroke } : {}) }
      }
      if (layer.shape === "line") {
        const stroke = layer.stroke ?? { color: typeof layer.fill === "string" ? layer.fill : "#000000", width: 2 }
        return { ...b, kind: "line", stroke }
      }
      return {
        ...b,
        kind: "rect",
        ...(layer.fill !== undefined ? { fill: layer.fill } : {}),
        ...(layer.stroke ? { stroke: layer.stroke } : {}),
        cornerRadius: layer.cornerRadius === undefined ? 0 : resolveLength(layer.cornerRadius, Math.min(box.width, box.height)),
      }
    },
  }
}

// ───────────────────────────── group ─────────────────────────────

function prepareGroup(
  ctx: Ctx,
  layer: ResolvedGroupLayer,
  parentW: number,
  parentH: number,
  path: (string | number)[],
  override: SizeOverride
): Prepared {
  const req = frameSize(layer.frame, parentW, parentH)
  const fixedW = override.width ?? req.width
  const fixedH = override.height ?? req.height
  // Percentages inside an auto-sized group resolve against the space the group was offered.
  const outerW = fixedW ?? parentW
  const outerH = fixedH ?? parentH
  const [pt, pr, pb, pl] = resolveInsets(layer.padding, outerW, outerH)
  const cw = Math.max(0, outerW - pl - pr)
  const ch = Math.max(0, outerH - pt - pb)
  const childPath = [...path, "children"]
  const layout = layer.layout

  type Slot = { prepared: Prepared; x: number; y: number; z: number; i: number }
  let slots: Slot[] = []
  let contentW = cw
  let contentH = ch

  if (layout.type === "stack") {
    const vertical = layout.direction === "vertical"
    const mainAvail = vertical ? ch : cw
    const crossAvail = vertical ? cw : ch
    const gap = resolveLength(layout.gap, mainAvail)
    const align = layout.align ?? "start"
    const prepared = layer.children.map((child, i) => {
      const crossOverride = align === "stretch" ? crossAvail : undefined
      const o: SizeOverride = vertical ? { width: crossOverride } : { height: crossOverride }
      return { child, i, p: prepare(ctx, child, cw, ch, [...childPath, i], o) }
    })
    const mainSizes = prepared.map(({ p }) => (vertical ? p.height : p.width))
    const total = mainSizes.reduce((n, s) => n + s, 0) + gap * Math.max(0, prepared.length - 1)
    const fixedMain = vertical ? fixedH !== null : fixedW !== null
    let cursor = 0
    let between = gap
    if (fixedMain) {
      const free = mainAvail - total
      switch (layout.justify ?? "start") {
        case "center":
          cursor = free / 2
          break
        case "end":
          cursor = free
          break
        case "space-between":
          if (prepared.length > 1 && free > 0) between = gap + free / (prepared.length - 1)
          break
      }
    }
    const crossSizes = prepared.map(({ p }) => (vertical ? p.width : p.height))
    const fixedCross = vertical ? fixedW !== null : fixedH !== null
    const crossContent = fixedCross ? crossAvail : Math.max(0, ...crossSizes)
    slots = prepared.map(({ child, i, p }, n) => {
      const cross = vertical ? p.width : p.height
      let crossPos = 0
      if (align === "center") crossPos = (crossContent - cross) / 2
      else if (align === "end") crossPos = crossContent - cross
      const main = cursor
      cursor += mainSizes[n] + between
      return { prepared: p, x: vertical ? crossPos : main, y: vertical ? main : crossPos, z: child.z ?? 0, i }
    })
    if (vertical) {
      contentH = total
      contentW = crossContent
    } else {
      contentW = total
      contentH = crossContent
    }
  } else if (layout.type === "grid") {
    const cols = layout.columns
    const gap = resolveLength(layout.gap, cw)
    const cellW = Math.max(0, (cw - (cols - 1) * gap) / cols)
    const n = layer.children.length
    const rowsUsed = Math.max(layout.rows ?? 0, Math.ceil(n / cols))
    const cellH =
      layout.rows !== undefined && fixedH !== null
        ? Math.max(0, (ch - (layout.rows - 1) * gap) / layout.rows)
        : cellW / (layout.cellAspect ?? 1)
    slots = layer.children.map((child, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const p = prepare(ctx, child, cellW, cellH, [...childPath, i], { width: cellW, height: cellH })
      return { prepared: p, x: col * (cellW + gap), y: row * (cellH + gap), z: child.z ?? 0, i }
    })
    contentH = rowsUsed * cellH + Math.max(0, rowsUsed - 1) * gap
  } else {
    slots = layer.children.map((child, i) => {
      const p = prepare(ctx, child, cw, ch, [...childPath, i])
      const box = placeFrame(child.frame, cw, ch, p.width, p.height)
      return { prepared: p, x: box.x, y: box.y, z: child.z ?? 0, i }
    })
  }

  const width = fixedW ?? contentW + pl + pr
  const height = fixedH ?? contentH + pt + pb
  return {
    width,
    height,
    build: (box): GroupNode => {
      const placed: { node: DisplayNode; z: number; i: number }[] = []
      for (const s of slots) {
        const node = s.prepared.build({ x: pl + s.x, y: pt + s.y, width: s.prepared.width, height: s.prepared.height })
        if (node) placed.push({ node, z: s.z, i: s.i })
      }
      return {
        ...base(layer, box),
        kind: "group",
        ...(layer.background !== undefined ? { background: layer.background } : {}),
        clip: !!layer.clip,
        cornerRadius: layer.cornerRadius === undefined ? 0 : resolveLength(layer.cornerRadius, Math.min(box.width, box.height)),
        children: paintOrder(placed),
      }
    },
  }
}
