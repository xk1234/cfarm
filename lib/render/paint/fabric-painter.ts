/**
 * DisplayList → Fabric.js 7 objects (doc 01 §2.6). Shared verbatim by the
 * server (`fabric/node`) and the browser preview (`fabric`); the platform only
 * supplies the Fabric namespace, decoded images and scratch canvases.
 *
 * Fabric's own text layout is not used: text nodes are a small FabricObject
 * subclass that draws the runs positioned by `layout/text.ts`. Shapes, images
 * (+ filters, clipping), groups, gradients, opacity, rotation and shadows are
 * native Fabric objects.
 *
 * Every object uses origin centre (Fabric 7's default): `left/top` is the box
 * centre in the parent's space (the canvas, or the parent group's centre).
 */
import type {
  Box,
  DisplayNode,
  DisplaySlide,
  EllipseNode,
  GroupNode,
  ImageNode,
  LineNode,
  RectNode,
  TextNode,
  TextRunPaint,
} from "../display-list"
import type { DecodedImage, FabricModule, FabricStaticCanvas, PlatformCanvas } from "../platform"
import type { ImageFilters, ResolvedPaint, ResolvedStroke, Shadow } from "../spec"

type FabricObj = InstanceType<FabricModule["FabricObject"]>

export type PaintEnv = {
  fabric: FabricModule
  images: ReadonlyMap<string, DecodedImage>
  createCanvas(width: number, height: number): PlatformCanvas
  /** Output multiplier (canvas px per spec px). */
  scale: number
}

const configured = new WeakSet<object>()

function configureFabric(fabric: FabricModule): void {
  if (configured.has(fabric)) return
  configured.add(fabric)
  // Group caches (clipping, opacity) must be full resolution at 2× scale.
  fabric.config.configure({ perfLimitSizeTotal: 8192 * 8192, maxCacheSideLimit: 8192 })
  // Same filter maths on server and browser (WebGL would differ slightly).
  fabric.setFilterBackend(new fabric.Canvas2dFilterBackend())
}

/** Paints one slide onto `canvas`, resizing it to `width × height × scale`. */
export async function paintSlide(canvas: FabricStaticCanvas, slide: DisplaySlide, env: PaintEnv): Promise<void> {
  const { fabric, scale } = env
  configureFabric(fabric)
  canvas.clear()
  canvas.renderOnAddRemove = false
  canvas.enableRetinaScaling = false
  canvas.setDimensions({ width: Math.round(slide.width * scale), height: Math.round(slide.height * scale) })
  canvas.setViewportTransform([scale, 0, 0, scale, 0, 0])
  canvas.backgroundColor = ""

  const objects: FabricObj[] = [
    new fabric.Rect({
      left: slide.width / 2,
      top: slide.height / 2,
      width: slide.width,
      height: slide.height,
      strokeWidth: 0,
      fill: toFill(fabric, slide.background, slide.width, slide.height),
      objectCaching: false,
    }),
  ]
  const root = { width: slide.width, height: slide.height, centered: false }
  for (const node of slide.nodes) objects.push(...buildNode(env, node, root))
  canvas.add(...objects)
  canvas.renderAll()
}

type Parent = { width: number; height: number; centered: boolean }

/** Box centre in the parent's coordinate space. */
function centre(box: Box, parent: Parent): { left: number; top: number } {
  const ox = parent.centered ? parent.width / 2 : 0
  const oy = parent.centered ? parent.height / 2 : 0
  return { left: box.x + box.width / 2 - ox, top: box.y + box.height / 2 - oy }
}

function common(fabric: FabricModule, node: DisplayNode, parent: Parent) {
  return {
    ...centre(node.box, parent),
    angle: node.rotation,
    opacity: node.opacity,
    shadow: node.shadow ? toShadow(fabric, node.shadow) : null,
    objectCaching: false,
  }
}

function buildNode(env: PaintEnv, node: DisplayNode, parent: Parent): FabricObj[] {
  switch (node.kind) {
    case "rect":
      return [buildRect(env.fabric, node, parent)]
    case "ellipse":
      return [buildEllipse(env.fabric, node, parent)]
    case "line":
      return [buildLine(env.fabric, node, parent)]
    case "text":
      return [buildText(env.fabric, node, parent)]
    case "image":
      return buildImage(env, node, parent)
    case "group":
      return [buildGroup(env, node, parent)]
  }
}

// ───────────────────────────── shapes ─────────────────────────────

function strokeProps(stroke: ResolvedStroke | undefined) {
  if (!stroke || stroke.width <= 0) return { stroke: null, strokeWidth: 0 }
  return {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeLineJoin: (stroke.join ?? "miter") as CanvasLineJoin,
    strokeMiterLimit: 4,
  }
}

/** Strokes sit inside the box (like a CSS border), so a 1080-wide rect stays 1080 wide. */
function buildRect(fabric: FabricModule, node: RectNode, parent: Parent): FabricObj {
  const sw = node.stroke && node.stroke.width > 0 ? node.stroke.width : 0
  const w = Math.max(0, node.box.width - sw)
  const h = Math.max(0, node.box.height - sw)
  const r = Math.max(0, Math.min(node.cornerRadius - sw / 2, w / 2, h / 2))
  return new fabric.Rect({
    ...common(fabric, node, parent),
    width: w,
    height: h,
    rx: r,
    ry: r,
    fill: node.fill === undefined ? "" : toFill(fabric, node.fill, w, h),
    ...strokeProps(node.stroke),
  })
}

function buildEllipse(fabric: FabricModule, node: EllipseNode, parent: Parent): FabricObj {
  const sw = node.stroke && node.stroke.width > 0 ? node.stroke.width : 0
  const w = Math.max(0, node.box.width - sw)
  const h = Math.max(0, node.box.height - sw)
  return new fabric.Ellipse({
    ...common(fabric, node, parent),
    rx: w / 2,
    ry: h / 2,
    fill: node.fill === undefined ? "" : toFill(fabric, node.fill, w, h),
    ...strokeProps(node.stroke),
  })
}

function buildLine(fabric: FabricModule, node: LineNode, parent: Parent): FabricObj {
  const { left, top } = centre(node.box, parent)
  const { width: w, height: h } = node.box
  return new fabric.Line([left - w / 2, top - h / 2, left + w / 2, top + h / 2], {
    angle: node.rotation,
    opacity: node.opacity,
    shadow: node.shadow ? toShadow(fabric, node.shadow) : null,
    objectCaching: false,
    stroke: node.stroke.color,
    strokeWidth: node.stroke.width,
    strokeLineCap: node.stroke.join === "round" ? "round" : "butt",
  })
}

// ───────────────────────────── images ─────────────────────────────

function buildImage(env: PaintEnv, node: ImageNode, parent: Parent): FabricObj[] {
  const { fabric } = env
  const decoded = env.images.get(node.assetKey)
  const { width: w, height: h } = node.box
  const p = node.placement
  const children: FabricObj[] = []
  if (node.backdrop !== undefined) {
    children.push(new fabric.Rect({ left: 0, top: 0, width: w, height: h, strokeWidth: 0, fill: toFill(fabric, node.backdrop, w, h), objectCaching: false }))
  }
  if (decoded && p.dw > 0 && p.dh > 0 && p.sw > 0 && p.sh > 0) {
    // Crop (and downscale to at most the output size) once, before filters.
    const k = Math.min(1, (p.dw * env.scale) / p.sw, (p.dh * env.scale) / p.sh)
    const tw = Math.max(1, Math.round(p.sw * k))
    const th = Math.max(1, Math.round(p.sh * k))
    const scratch = env.createCanvas(tw, th)
    const ctx = scratch.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ;(ctx as unknown as { quality?: string }).quality = "best"
      ctx.drawImage(decoded.element, p.sx, p.sy, p.sw, p.sh, 0, 0, tw, th)
    }
    const image = new fabric.FabricImage(scratch as unknown as HTMLCanvasElement, {
      left: p.dx + p.dw / 2 - w / 2,
      top: p.dy + p.dh / 2 - h / 2,
      scaleX: p.dw / tw,
      scaleY: p.dh / th,
      flipX: node.flipX,
      flipY: node.flipY,
      objectCaching: false,
    })
    const filters = toFilters(fabric, node.filters)
    if (filters.length) {
      image.filters = filters
      image.applyFilters()
    }
    children.push(image)
  }
  const r = Math.max(0, Math.min(node.cornerRadius, w / 2, h / 2))
  const clipPath =
    node.clip === "ellipse"
      ? new fabric.Ellipse({ left: 0, top: 0, rx: w / 2, ry: h / 2, objectCaching: false })
      : new fabric.Rect({ left: 0, top: 0, width: w, height: h, rx: r, ry: r, objectCaching: false })
  const group = makeGroup(fabric, children, {
    ...common(fabric, node, parent),
    width: w,
    height: h,
    clipPath,
    objectCaching: true,
  })
  const out: FabricObj[] = [group]
  if (node.border && node.border.width > 0) {
    const bw = node.border.width
    const base = { ...common(fabric, node, parent), shadow: null, fill: "", ...strokeProps(node.border) }
    out.push(
      node.clip === "ellipse"
        ? new fabric.Ellipse({ ...base, rx: Math.max(0, (w - bw) / 2), ry: Math.max(0, (h - bw) / 2) })
        : new fabric.Rect({
            ...base,
            width: Math.max(0, w - bw),
            height: Math.max(0, h - bw),
            rx: Math.max(0, r - bw / 2),
            ry: Math.max(0, r - bw / 2),
          })
    )
  }
  return out
}

function toFilters(fabric: FabricModule, f: ImageFilters | undefined) {
  const out: InstanceType<FabricModule["filters"]["BaseFilter"]>[] = []
  if (!f) return out
  if (f.grayscale) out.push(new fabric.filters.Grayscale())
  if (f.brightness) out.push(new fabric.filters.Brightness({ brightness: f.brightness }))
  if (f.contrast) out.push(new fabric.filters.Contrast({ contrast: f.contrast }))
  if (f.saturation) out.push(new fabric.filters.Saturation({ saturation: f.saturation }))
  if (f.tint && f.tint.opacity > 0) out.push(new fabric.filters.BlendColor({ color: f.tint.color, mode: "tint", alpha: f.tint.opacity }))
  if (f.blur) out.push(new fabric.filters.Blur({ blur: f.blur }))
  return out
}

// ───────────────────────────── groups ─────────────────────────────

const noopLayouts = new WeakMap<object, new () => InstanceType<FabricModule["LayoutManager"]>>()

/** A Group that keeps the exact box and child positions computed by our layout. */
function makeGroup(fabric: FabricModule, children: FabricObj[], options: Record<string, unknown>): FabricObj {
  let Noop = noopLayouts.get(fabric)
  if (!Noop) {
    Noop = class extends fabric.LayoutManager {
      performLayout(): void {}
    }
    noopLayouts.set(fabric, Noop)
  }
  return new fabric.Group(children, { ...options, layoutManager: new Noop(), subTargetCheck: false, interactive: false })
}

function buildGroup(env: PaintEnv, node: GroupNode, parent: Parent): FabricObj {
  const { fabric } = env
  const { width: w, height: h } = node.box
  const self: Parent = { width: w, height: h, centered: true }
  const r = Math.max(0, Math.min(node.cornerRadius, w / 2, h / 2))
  const children: FabricObj[] = []
  if (node.background !== undefined) {
    children.push(
      new fabric.Rect({ left: 0, top: 0, width: w, height: h, rx: r, ry: r, strokeWidth: 0, fill: toFill(fabric, node.background, w, h), objectCaching: false })
    )
  }
  for (const child of node.children) children.push(...buildNode(env, child, self))
  return makeGroup(fabric, children, {
    ...common(fabric, node, parent),
    width: w,
    height: h,
    ...(node.clip ? { clipPath: new fabric.Rect({ left: 0, top: 0, width: w, height: h, rx: r, ry: r, objectCaching: false }) } : {}),
    // A cache composites the group as one layer (correct group opacity / shadow).
    objectCaching: node.clip || node.opacity < 1 || !!node.shadow,
  })
}

// ───────────────────────────── text ─────────────────────────────

type TextObjectClass = new (node: TextNode, options: Record<string, unknown>) => FabricObj
const textClasses = new WeakMap<object, TextObjectClass>()

function textClass(fabric: FabricModule): TextObjectClass {
  const hit = textClasses.get(fabric)
  if (hit) return hit
  class LumenTextBlock extends fabric.FabricObject {
    static type = "LumenTextBlock"
    declare lumenNode: TextNode
    constructor(node: TextNode, options: Record<string, unknown>) {
      super(options)
      this.lumenNode = node
    }
    _render(ctx: CanvasRenderingContext2D): void {
      const scaling = this.getTotalObjectScaling()
      drawTextBlock(ctx, this.lumenNode, this.width, this.height, (scaling.x + scaling.y) / 2)
    }
  }
  textClasses.set(fabric, LumenTextBlock as unknown as TextObjectClass)
  return LumenTextBlock as unknown as TextObjectClass
}

function buildText(fabric: FabricModule, node: TextNode, parent: Parent): FabricObj {
  const Cls = textClass(fabric)
  return new Cls(node, {
    ...common(fabric, node, parent),
    width: node.box.width,
    height: node.box.height,
    fill: "",
    stroke: null,
    strokeWidth: 0,
  })
}

const ITALIC_SKEW = Math.tan((12 * Math.PI) / 180)

/** Draws a text node in object-local coordinates (origin = box centre). */
export function drawTextBlock(ctx: CanvasRenderingContext2D, node: TextNode, width: number, height: number, deviceScale: number): void {
  ctx.save()
  ctx.translate(-width / 2, -height / 2)
  if (node.clipToBox) {
    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    ctx.clip()
  }
  for (const bg of node.backgrounds) {
    ctx.save()
    ctx.globalAlpha *= bg.opacity
    ctx.fillStyle = bg.color
    roundRectPath(ctx, bg.x, bg.y, bg.width, bg.height, bg.radius)
    ctx.fill()
    ctx.restore()
  }
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  // Pass 1: strokes under every fill (outline text never cuts into a neighbour's fill).
  for (const run of node.runs) {
    if (!run.stroke) continue
    ctx.save()
    applyGlyphShadow(ctx, run.shadow, deviceScale)
    ctx.font = run.font
    ctx.lineWidth = run.stroke.width
    ctx.strokeStyle = run.stroke.color
    ctx.lineJoin = run.stroke.join ?? "round"
    ctx.miterLimit = 2
    drawRunGlyphs(ctx, run, (t, x, y) => ctx.strokeText(t, x, y))
    ctx.restore()
  }
  // Pass 2: fills (+ underline).
  for (const run of node.runs) {
    ctx.save()
    if (!run.stroke) applyGlyphShadow(ctx, run.shadow, deviceScale)
    ctx.font = run.font
    ctx.fillStyle = canvasPaint(ctx, run.fill, width, height)
    drawRunGlyphs(ctx, run, (t, x, y) => ctx.fillText(t, x, y))
    if (run.underline) {
      const thickness = Math.max(1, run.fontSize * 0.06)
      ctx.fillRect(run.x, run.baseline + run.fontSize * 0.1, run.width, thickness)
    }
    ctx.restore()
  }
  ctx.restore()
}

function drawRunGlyphs(ctx: CanvasRenderingContext2D, run: TextRunPaint, draw: (text: string, x: number, y: number) => void): void {
  const glyphs = run.glyphs ?? [{ text: run.text, dx: 0 }]
  if (run.syntheticItalic) {
    ctx.save()
    ctx.translate(run.x, run.baseline)
    ctx.transform(1, 0, -ITALIC_SKEW, 1, 0, 0)
    for (const g of glyphs) draw(g.text, g.dx, 0)
    ctx.restore()
    return
  }
  for (const g of glyphs) draw(g.text, run.x + g.dx, run.baseline)
}

function applyGlyphShadow(ctx: CanvasRenderingContext2D, shadow: Shadow | undefined, scale: number): void {
  if (!shadow) return
  ctx.shadowColor = shadow.color
  ctx.shadowBlur = shadow.blur * scale
  ctx.shadowOffsetX = (shadow.offsetX ?? 0) * scale
  ctx.shadowOffsetY = (shadow.offsetY ?? 0) * scale
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ───────────────────────────── paints ─────────────────────────────

/** Endpoints of a linear gradient across a w×h box (0° = left→right, 90° = top→bottom). */
export function linearGradientPoints(angle: number, w: number, h: number) {
  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  const cx = w / 2
  const cy = h / 2
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half }
}

function radialGeometry(center: { x: number; y: number } | undefined, w: number, h: number) {
  const cx = (center?.x ?? 0.5) * w
  const cy = (center?.y ?? 0.5) * h
  const r = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy))
  return { cx, cy, r }
}

/** Fabric fill for a paint over an object of `w × h` (gradient coords from its top-left). */
function toFill(fabric: FabricModule, paint: ResolvedPaint, w: number, h: number) {
  if (typeof paint === "string") return paint
  const colorStops = paint.stops.map((s) => ({ offset: s.offset, color: s.color }))
  if (paint.type === "linear") {
    return new fabric.Gradient({ type: "linear", gradientUnits: "pixels", coords: linearGradientPoints(paint.angle, w, h), colorStops })
  }
  const { cx, cy, r } = radialGeometry(paint.center, w, h)
  return new fabric.Gradient({
    type: "radial",
    gradientUnits: "pixels",
    coords: { x1: cx, y1: cy, r1: 0, x2: cx, y2: cy, r2: r },
    colorStops,
  })
}

/** Canvas fill style for text paints, spanning the text node box. */
function canvasPaint(ctx: CanvasRenderingContext2D, paint: ResolvedPaint, w: number, h: number): string | CanvasGradient {
  if (typeof paint === "string") return paint
  let g: CanvasGradient
  if (paint.type === "linear") {
    const p = linearGradientPoints(paint.angle, w, h)
    g = ctx.createLinearGradient(p.x1, p.y1, p.x2, p.y2)
  } else {
    const { cx, cy, r } = radialGeometry(paint.center, w, h)
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  }
  for (const s of paint.stops) g.addColorStop(s.offset, s.color)
  return g
}

function toShadow(fabric: FabricModule, shadow: Shadow) {
  return new fabric.Shadow({
    color: shadow.color,
    blur: shadow.blur,
    offsetX: shadow.offsetX ?? 0,
    offsetY: shadow.offsetY ?? 0,
  })
}
