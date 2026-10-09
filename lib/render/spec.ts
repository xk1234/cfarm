/**
 * Slideshow JSON Spec v1 — the frozen contract (docs/refactor/01-slideshow-json-spec.md).
 *
 * A spec is the only input to rendering. Templates are specs with `slots`;
 * `resolveTemplate(template, slotValues)` turns one into a `ResolvedSpec`
 * (no slots, repeats, tokens or named styles left), which is the only thing
 * the engine (`lib/render/engine.ts`) accepts.
 *
 * Deviations from doc 01 decided by the owner:
 * - Image sources are `{url}` | `{media}` | `{collection, pick?, seed?}`
 *   (`media` is a `media` row id; the doc's `{asset}` is not used).
 * - `FontRef.url` is not supported: only bundled fonts (no uploads).
 * - No PDF output; render output formats are png | jpeg | webp (+ zip).
 *
 * This module is isomorphic (server + browser): no Node APIs.
 */
import { z } from "zod"

import { listFonts, type FontFaceInfo } from "./engine"

// ─────────────────────────────── limits ───────────────────────────────

export const SPEC_VERSION = 1 as const

export const SPEC_LIMITS = {
  /** Serialized spec size in bytes (UTF-16 length of JSON is used as proxy). */
  maxSpecBytes: 256 * 1024,
  /** Slides after repeat expansion and `if` filtering (TikTok photo-mode max). */
  maxSlides: 35,
  /** Layers per slide after repeat expansion (all nesting levels). */
  maxLayersPerSlide: 64,
  /** Layer nesting depth: a top-level layer has depth 1. */
  maxDepth: 4,
  minCanvasWidth: 320,
  maxCanvasWidth: 2160,
  minCanvasHeight: 320,
  maxCanvasHeight: 3840,
  maxFonts: 16,
  maxImageAssets: 80,
} as const

export const DEFAULT_CANVAS_WIDTH = 1080

export const CANVAS_PRESETS = {
  "9:16": [9, 16],
  "4:5": [4, 5],
  "1:1": [1, 1],
  "3:4": [3, 4],
  "3:2": [3, 2],
  "16:9": [16, 9],
} as const satisfies Record<string, readonly [number, number]>

export type CanvasPreset = keyof typeof CANVAS_PRESETS

// ─────────────────────────────── types ───────────────────────────────

export type Pct = `${number}%`
/** px, or a percentage of the parent box (width for x/width, height for y/height). */
export type Length = number | Pct
/** `"$colors.accent"` or `"$fonts.heading"` → theme lookup. */
export type TokenRef = `$${string}`
/** `#rgb #rgba #rrggbb #rrggbbaa rgb() rgba() hsl() hsla() transparent` or a TokenRef. */
export type ColorValue = string
/** Binds a value to a slot: `"hero"`, or `"item.image"` inside a repeat. */
export type SlotRef = { slot: string }
export type Valued<T> = T | SlotRef

export type Anchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"

export type GradientStop = { offset: number; color: ColorValue }
export type LinearGradient = {
  type: "linear"
  /** Degrees, 0 = left→right, 90 = top→bottom. */
  angle: number
  stops: GradientStop[]
}
export type RadialGradient = {
  type: "radial"
  stops: GradientStop[]
  /** 0..1 in the painted box; default centre. */
  center?: { x: number; y: number }
}
export type Paint = ColorValue | LinearGradient | RadialGradient

export type StrokeJoin = "miter" | "round" | "bevel"
export type Stroke = { color: Valued<ColorValue>; width: number; join?: StrokeJoin }
export type Shadow = {
  color: ColorValue
  blur: number
  offsetX?: number
  offsetY?: number
}

/** A layer's box inside its parent box: insets, or an anchor point at (x, y). */
export type Frame = {
  /** top,right,bottom,left; `inset: 0` = full-bleed. Wins over x/y/width/height. */
  inset?: Length | [Length, Length, Length, Length]
  x?: Length
  y?: Length
  /** `"auto"` is only valid for text (shrink-wrap). Default 100%. */
  width?: Length | "auto"
  /** `"auto"` = content height (text, groups with stack layout). */
  height?: Length | "auto"
  /** Default `"top-left"`. */
  anchor?: Anchor
}

export type Canvas = {
  /** Width 1080 (or `width`), height derived from the ratio. */
  preset?: CanvasPreset
  width?: number
  height?: number
  /** Default `"#000000"`. */
  background?: Valued<Paint>
}

/** A font the spec uses. Must exist in the bundled registry (`listFonts()`). */
export type FontRef = { family: string; weights?: number[] }

export type TextBackground = {
  /** `lines` = one pill per line; `block` = one box around all lines. */
  mode: "lines" | "block"
  color: Valued<ColorValue>
  opacity?: number
  /** px, default .28em */
  paddingX?: number
  /** px, default .10em */
  paddingY?: number
  radius?: number
}

export type FontSizeRange = { min: number; max: number }

export type TextStyle = {
  /** Family from the registry, or `"$fonts.<name>"`. */
  fontFamily?: string
  /** 100..900; must exist for the family. */
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  /** A range means auto-fit: the largest integer px that fits box and maxLines. */
  fontSize?: number | FontSizeRange
  color?: Valued<Paint>
  align?: "left" | "center" | "right" | "justify"
  verticalAlign?: "top" | "middle" | "bottom"
  lineHeight?: number
  letterSpacing?: number
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  /** Painted under the fill. */
  stroke?: Stroke
  /** Glyph shadow. */
  shadow?: Shadow
  background?: TextBackground
  maxLines?: number
  /** Default `"shrink"` when fontSize is a range, otherwise `"error"`. */
  overflow?: "shrink" | "ellipsis" | "clip" | "error"
  /** `"word"` falls back to char breaking for CJK runs. */
  wrap?: "word" | "char" | "none"
  underline?: boolean
}

export type Theme = {
  colors?: Record<string, string>
  fonts?: Record<string, string>
  textStyles?: Record<string, TextStyle>
}

/** Where an image comes from. Collection picks are resolved to `{media}` at resolve time. */
export type MediaImageSource = { media: string }
export type UrlImageSource = { url: string }
export type CollectionImageSource = {
  collection: string
  /** Default `"first"`. A number is a 0-based position in the collection. */
  pick?: "first" | "random" | number
  /** Seed for `pick: "random"`; the same seed gives the same pick. */
  seed?: string
}
export type ImageSource = UrlImageSource | MediaImageSource | CollectionImageSource

export type ImageSlotDef = {
  type: "image"
  label?: string
  required?: boolean
  default?: ImageSource
  minWidth?: number
  minHeight?: number
}
export type TextSlotDef = {
  type: "text"
  label?: string
  required?: boolean
  default?: string
  maxLength?: number
  multiline?: boolean
}
export type ColorSlotDef = { type: "color"; label?: string; required?: boolean; default?: string }
export type NumberSlotDef = {
  type: "number"
  label?: string
  required?: boolean
  default?: number
  min?: number
  max?: number
}
export type BooleanSlotDef = { type: "boolean"; label?: string; default?: boolean }
export type ScalarSlotDef =
  | ImageSlotDef
  | TextSlotDef
  | ColorSlotDef
  | NumberSlotDef
  | BooleanSlotDef
export type ListSlotDef = {
  type: "list"
  label?: string
  minItems?: number
  maxItems?: number
  item: Record<string, ScalarSlotDef>
}
export type SlotDef = ScalarSlotDef | ListSlotDef
export type SlotType = SlotDef["type"]

/** Image slots accept an ImageSource or a bare https URL string. */
export type ImageSlotValue = ImageSource | string
/** Validated against `slots` by `validateSlotValues`. */
export type SlotValues = Record<string, unknown>

/** Truthy unless the slot value is missing, null, false, "" or []. */
export type Condition = SlotRef | { not: SlotRef } | boolean

export type LayerBase = {
  id: string
  name?: string
  /** Required unless the parent group uses a stack or grid layout. */
  frame?: Frame
  opacity?: Valued<number>
  /** Degrees about the frame centre. */
  rotation?: number
  /** Stable re-order within the parent; default is array order. */
  z?: number
  if?: Condition
  /** Drop shadow of the whole layer. */
  shadow?: Shadow
}

export type ImageFit = "cover" | "contain" | "fill" | "none"
export type ImageFilters = {
  brightness?: number
  contrast?: number
  saturation?: number
  grayscale?: boolean
  blur?: number
  tint?: { color: ColorValue; opacity: number }
}
export type ImageProps = {
  src: ImageSource | SlotRef
  /** Default `"cover"`. */
  fit?: ImageFit
  /** 0..1, default .5/.5: which part of the source stays in view on cover. */
  focal?: { x: number; y: number }
  /** ≥1, extra scale about the focal point. */
  zoom?: number
  cornerRadius?: Length
  clip?: "rect" | "ellipse"
  border?: Stroke
  /** Fills the letterbox area when fit = contain. */
  backdrop?: Paint
  filters?: ImageFilters
  flipX?: boolean
  flipY?: boolean
}
export type ImageLayer = LayerBase & { type: "image" } & ImageProps

export type Span = { text: Valued<string>; style?: Partial<TextStyle> }
export type NamedStyleWithOverrides = [string, TextStyle]
export type TextLayer = LayerBase & {
  type: "text"
  /** Strings support `{{slot}}` interpolation. */
  text: Valued<string> | Span[]
  /** `"emphasis"`: `*word*` → emphasisStyle; `\*` escapes. */
  markup?: "none" | "emphasis"
  /** Named theme style, inline style, or named style + overrides. */
  style?: string | TextStyle | NamedStyleWithOverrides
  emphasisStyle?: Partial<TextStyle>
}

export type ShapeLayer = LayerBase & {
  type: "shape"
  /** `line` runs from the frame's top-left to bottom-right. */
  shape: "rect" | "ellipse" | "line"
  fill?: Valued<Paint>
  stroke?: Stroke
  cornerRadius?: Length
}

export type AbsoluteLayout = { type: "absolute" }
export type StackLayout = {
  type: "stack"
  direction: "vertical" | "horizontal"
  gap?: Length
  align?: "start" | "center" | "end" | "stretch"
  justify?: "start" | "center" | "end" | "space-between"
}
export type GridLayout = {
  type: "grid"
  columns: number
  rows?: number
  gap?: Length
  /** width / height of a cell; used when `rows` is omitted. */
  cellAspect?: number
}
export type GroupLayout = AbsoluteLayout | StackLayout | GridLayout

export type GroupLayer = LayerBase & {
  type: "group"
  /** Default `{type: "absolute"}`. */
  layout?: GroupLayout
  clip?: boolean
  cornerRadius?: Length
  background?: Paint
  padding?: Length | [Length, Length, Length, Length]
  children: LayerEntry[]
}

export type Layer = ImageLayer | TextLayer | ShapeLayer | GroupLayer
export type LayerType = Layer["type"]
export type RepeatDirective = { slot: string; as?: string }
export type LayerRepeat = { repeat: RepeatDirective; layer: Layer }
export type LayerEntry = Layer | LayerRepeat

export type Slide = {
  /** May interpolate, e.g. `"item-{{index1}}"`. */
  id: string
  name?: string
  if?: Condition
  /** Overrides `canvas.background`. */
  background?: Valued<Paint>
  layers: LayerEntry[]
}
export type SlideRepeat = { repeat: RepeatDirective; slide: Slide }
export type SlideEntry = Slide | SlideRepeat

export type SpecDefaults = {
  text?: TextStyle
  image?: Partial<Omit<ImageProps, "src">>
}

export type SlideshowSpec = {
  $schema?: string
  version: 1
  id?: string
  name?: string
  description?: string
  canvas: Canvas
  fonts?: FontRef[]
  theme?: Theme
  defaults?: SpecDefaults
  /** Present only in templates. */
  slots?: Record<string, SlotDef>
  slides: SlideEntry[]
  /** Opaque, round-tripped, never rendered. */
  meta?: Record<string, unknown>
}

// ───────────── resolved (engine-facing): literal values only ─────────────

/** Paint with every token resolved to a literal colour. */
export type ResolvedPaint = Paint
export type ResolvedStroke = { color: string; width: number; join?: StrokeJoin }
export type ResolvedTextBackground = Omit<TextBackground, "color"> & { color: string }

export type ResolvedTextStyle = {
  fontFamily: string
  fontWeight: number
  fontStyle: "normal" | "italic"
  fontSize: number | FontSizeRange
  color: ResolvedPaint
  align: "left" | "center" | "right" | "justify"
  verticalAlign: "top" | "middle" | "bottom"
  lineHeight: number
  letterSpacing: number
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize"
  stroke?: ResolvedStroke
  shadow?: Shadow
  background?: ResolvedTextBackground
  maxLines?: number
  overflow: "shrink" | "ellipsis" | "clip" | "error"
  wrap: "word" | "char" | "none"
  underline: boolean
}
export type ResolvedTextStylePatch = Partial<ResolvedTextStyle>

/** Provenance of a collection pick, recorded for reproducibility. */
export type CollectionPickRecord = {
  collection: string
  pick: "first" | "random" | number
  seed: string
  index: number
}
export type ResolvedImageSource =
  | UrlImageSource
  | (MediaImageSource & { from?: CollectionPickRecord })

export type ResolvedLayerBase = {
  id: string
  name?: string
  frame?: Frame
  opacity: number
  rotation: number
  z?: number
  shadow?: Shadow
}
export type ResolvedImageLayer = ResolvedLayerBase & {
  type: "image"
  src: ResolvedImageSource
  fit: ImageFit
  focal: { x: number; y: number }
  zoom: number
  cornerRadius?: Length
  clip?: "rect" | "ellipse"
  border?: ResolvedStroke
  backdrop?: ResolvedPaint
  filters?: ImageFilters
  flipX?: boolean
  flipY?: boolean
}
export type ResolvedSpan = { text: string; style?: ResolvedTextStylePatch }
export type ResolvedTextLayer = ResolvedLayerBase & {
  type: "text"
  text: string | ResolvedSpan[]
  markup: "none" | "emphasis"
  style: ResolvedTextStyle
  emphasisStyle?: ResolvedTextStylePatch
}
export type ResolvedShapeLayer = ResolvedLayerBase & {
  type: "shape"
  shape: "rect" | "ellipse" | "line"
  fill?: ResolvedPaint
  stroke?: ResolvedStroke
  cornerRadius?: Length
}
export type ResolvedGroupLayer = ResolvedLayerBase & {
  type: "group"
  layout: GroupLayout
  clip?: boolean
  cornerRadius?: Length
  background?: ResolvedPaint
  padding?: Length | [Length, Length, Length, Length]
  children: ResolvedLayer[]
}
export type ResolvedLayer =
  | ResolvedImageLayer
  | ResolvedTextLayer
  | ResolvedShapeLayer
  | ResolvedGroupLayer

export type ResolvedSlide = {
  id: string
  name?: string
  /** Slide background, or the canvas background. */
  background: ResolvedPaint
  layers: ResolvedLayer[]
}
export type ResolvedCanvas = { width: number; height: number; background: ResolvedPaint }
export type ResolvedSpec = {
  version: 1
  id?: string
  name?: string
  description?: string
  canvas: ResolvedCanvas
  fonts: FontRef[]
  slides: ResolvedSlide[]
  meta?: Record<string, unknown>
}

/** Defaults the resolver fills into every text style (doc 01 §2.2). */
export const TEXT_STYLE_DEFAULTS = {
  fontFamily: "Inter",
  fontWeight: 400,
  fontStyle: "normal",
  fontSize: 48,
  color: "#FFFFFF",
  align: "left",
  verticalAlign: "top",
  lineHeight: 1.15,
  letterSpacing: 0,
  textTransform: "none",
  wrap: "word",
  underline: false,
} as const satisfies Omit<ResolvedTextStyle, "overflow">

export const DEFAULT_CANVAS_BACKGROUND = "#000000"

// ─────────────────────────────── issues ───────────────────────────────

export const SPEC_ISSUE_CODES = [
  // structural (zod issue codes are prefixed with "schema.")
  "schema.invalid_type",
  "schema.invalid_union",
  "schema.invalid_value",
  "schema.invalid_format",
  "schema.too_big",
  "schema.too_small",
  "schema.unrecognized_keys",
  "schema.custom",
  // semantic (template level)
  "spec.invalid_json",
  "canvas.size_required",
  "layer.duplicate_id",
  "slot.unknown",
  "slot.wrong_kind",
  "repeat.not_list",
  "style.unknown",
  "token.unknown",
  "font.unknown",
  "font.weight_unavailable",
  "limits.depth",
  "limits.layers",
  "limits.slides",
  "limits.spec_size",
  "limits.assets",
  // instance (slot values, resolve, render)
  "slot.required",
  "slot.type",
  "slot.list_bounds",
  "slot.max_length",
  "slot.range",
  "asset.collection_unresolved",
  "asset.collection_empty",
  "asset.pick_out_of_range",
  "asset.fetch_failed",
  "asset.unsupported_type",
  "asset.too_large",
  "text.overflow",
  // warnings
  "slot.unused",
  "layout.frame_ignored",
  "frame.inset_conflict",
  "text.shrunk_below_min",
  "asset.upscaled",
  "asset.below_min_size",
  "font.fallback_glyphs",
] as const

export type SpecIssueCode = (typeof SPEC_ISSUE_CODES)[number] | `schema.${string}`

export type SpecIssue = {
  code: SpecIssueCode
  /** JSON Pointer into the template, `/slotValues/...`, or the ResolvedSpec. */
  path: string
  message: string
  /** Slide index after expansion, for layout/render issues. */
  slide?: number
}

export type SpecValidationResult = {
  ok: boolean
  errors: SpecIssue[]
  warnings: SpecIssue[]
  /** The parsed spec when it is structurally valid. */
  spec?: SlideshowSpec
}

export class SpecError extends Error {
  readonly errors: SpecIssue[]
  readonly warnings: SpecIssue[]
  constructor(errors: SpecIssue[], warnings: SpecIssue[] = []) {
    super(
      errors.length
        ? `Invalid slideshow spec: ${errors
            .slice(0, 3)
            .map((e) => `${e.path || "/"} ${e.message}`)
            .join("; ")}`
        : "Invalid slideshow spec"
    )
    this.name = "SpecError"
    this.errors = errors
    this.warnings = warnings
  }
}

/** Encodes path segments as an RFC 6901 JSON Pointer. */
export function jsonPointer(segments: readonly (string | number)[]): string {
  return segments
    .map((s) => "/" + String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("")
}

// ─────────────────────────────── zod schemas ───────────────────────────────

const COLOR_RE =
  /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^()]*\)|hsla?\([^()]*\)|transparent|\$[A-Za-z_][A-Za-z0-9_-]*\.[A-Za-z0-9_.-]+)$/
const LITERAL_COLOR_RE =
  /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^()]*\)|hsla?\([^()]*\)|transparent)$/
const SLOT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const SLOT_PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/
const ID_RE = /^[A-Za-z0-9{][A-Za-z0-9_.{}~ -]{0,127}$/

const finite = () => z.number().finite()

export const PctSchema = z.templateLiteral([z.number(), "%"])
export const LengthSchema: z.ZodType<Length> = z.union([finite(), PctSchema], {
  error: 'Expected a number or a percentage string like "84%".',
})
export const ColorValueSchema = z
  .string()
  .regex(COLOR_RE, { error: 'Expected a colour such as "#FFF176", "rgba(0,0,0,0.5)" or "$colors.accent".' })
export const SlotRefSchema: z.ZodType<SlotRef> = z.strictObject({
  slot: z.string().regex(SLOT_PATH_RE, { error: 'Expected a slot name like "hero" or "item.image".' }),
})
const valued = <T>(schema: z.ZodType<T>): z.ZodType<Valued<T>> =>
  z.union([schema, SlotRefSchema]) as z.ZodType<Valued<T>>

export const AnchorSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
])

const GradientStopSchema = z.strictObject({
  offset: z.number().min(0).max(1),
  color: ColorValueSchema,
})
export const PaintSchema: z.ZodType<Paint> = z.union([
  ColorValueSchema,
  z.strictObject({
    type: z.literal("linear"),
    angle: finite(),
    stops: z.array(GradientStopSchema).min(2).max(16),
  }),
  z.strictObject({
    type: z.literal("radial"),
    stops: z.array(GradientStopSchema).min(2).max(16),
    center: z
      .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .optional(),
  }),
])

export const StrokeSchema: z.ZodType<Stroke> = z.strictObject({
  color: valued(ColorValueSchema),
  width: z.number().min(0).max(200),
  join: z.enum(["miter", "round", "bevel"]).optional(),
})
export const ShadowSchema: z.ZodType<Shadow> = z.strictObject({
  color: ColorValueSchema,
  blur: z.number().min(0).max(500),
  offsetX: finite().optional(),
  offsetY: finite().optional(),
})

const LengthOrAuto = z.union([LengthSchema, z.literal("auto")], {
  error: 'Expected a number, a percentage string like "84%", or "auto".',
})
const Insets = z.union([LengthSchema, z.tuple([LengthSchema, LengthSchema, LengthSchema, LengthSchema])], {
  error: 'Expected a length or [top, right, bottom, left].',
})

export const FrameSchema: z.ZodType<Frame> = z.strictObject({
  inset: Insets.optional(),
  x: LengthSchema.optional(),
  y: LengthSchema.optional(),
  width: LengthOrAuto.optional(),
  height: LengthOrAuto.optional(),
  anchor: AnchorSchema.optional(),
})

export const CanvasSchema: z.ZodType<Canvas> = z.strictObject({
  preset: z.enum(Object.keys(CANVAS_PRESETS) as [CanvasPreset, ...CanvasPreset[]]).optional(),
  width: z.number().int().min(SPEC_LIMITS.minCanvasWidth).max(SPEC_LIMITS.maxCanvasWidth).optional(),
  height: z.number().int().min(SPEC_LIMITS.minCanvasHeight).max(SPEC_LIMITS.maxCanvasHeight).optional(),
  background: valued(PaintSchema).optional(),
})

export const FontRefSchema: z.ZodType<FontRef> = z.strictObject({
  family: z.string().min(1).max(128),
  weights: z.array(z.number().int().min(100).max(900)).max(9).optional(),
})

const FontSizeRangeSchema = z
  .strictObject({ min: z.number().min(4).max(1000), max: z.number().min(4).max(1000) })
  .refine((r) => r.min <= r.max, { error: "fontSize.min must be ≤ fontSize.max." })

const textStyleShape = {
  fontFamily: z.string().min(1).max(128).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  fontSize: z.union([z.number().min(4).max(1000), FontSizeRangeSchema]).optional(),
  color: valued(PaintSchema).optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  lineHeight: z.number().min(0.5).max(4).optional(),
  letterSpacing: z.number().min(-100).max(500).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  stroke: StrokeSchema.optional(),
  shadow: ShadowSchema.optional(),
  background: z
    .strictObject({
      mode: z.enum(["lines", "block"]),
      color: valued(ColorValueSchema),
      opacity: z.number().min(0).max(1).optional(),
      paddingX: z.number().min(0).max(500).optional(),
      paddingY: z.number().min(0).max(500).optional(),
      radius: z.number().min(0).max(2000).optional(),
    })
    .optional(),
  maxLines: z.number().int().min(1).max(100).optional(),
  overflow: z.enum(["shrink", "ellipsis", "clip", "error"]).optional(),
  wrap: z.enum(["word", "char", "none"]).optional(),
  underline: z.boolean().optional(),
}
/** All TextStyle fields are optional, so this also validates `Partial<TextStyle>`. */
export const TextStyleSchema: z.ZodType<TextStyle> = z.strictObject(textStyleShape)

export const ThemeSchema: z.ZodType<Theme> = z.strictObject({
  colors: z.record(z.string().regex(SLOT_NAME_RE), z.string().regex(LITERAL_COLOR_RE)).optional(),
  fonts: z.record(z.string().regex(SLOT_NAME_RE), z.string().min(1).max(128)).optional(),
  textStyles: z.record(z.string().min(1).max(64), TextStyleSchema).optional(),
})

const HttpsUrl = z
  .string()
  .max(2048)
  .regex(/^https:\/\/[^\s]+$/, { error: "Image URLs must be absolute https:// URLs." })
export const ImageSourceSchema: z.ZodType<ImageSource> = z.union(
  [
    z.strictObject({ url: HttpsUrl }),
    z.strictObject({ media: z.string().min(1).max(36) }),
    z.strictObject({
      collection: z.string().min(1).max(255),
      pick: z.union([z.literal("first"), z.literal("random"), z.number().int().min(0)]).optional(),
      seed: z.string().max(128).optional(),
    }),
  ],
  { error: 'Expected an image source: {"url"}, {"media"} or {"collection", "pick", "seed"}.' }
)

const slotBase = { label: z.string().max(128).optional() }
const ImageSlotDefSchema = z.strictObject({
  type: z.literal("image"),
  ...slotBase,
  required: z.boolean().optional(),
  default: ImageSourceSchema.optional(),
  minWidth: z.number().int().min(1).optional(),
  minHeight: z.number().int().min(1).optional(),
})
const TextSlotDefSchema = z.strictObject({
  type: z.literal("text"),
  ...slotBase,
  required: z.boolean().optional(),
  default: z.string().optional(),
  maxLength: z.number().int().min(1).max(10_000).optional(),
  multiline: z.boolean().optional(),
})
const ColorSlotDefSchema = z.strictObject({
  type: z.literal("color"),
  ...slotBase,
  required: z.boolean().optional(),
  default: z.string().regex(LITERAL_COLOR_RE).optional(),
})
const NumberSlotDefSchema = z.strictObject({
  type: z.literal("number"),
  ...slotBase,
  required: z.boolean().optional(),
  default: finite().optional(),
  min: finite().optional(),
  max: finite().optional(),
})
const BooleanSlotDefSchema = z.strictObject({
  type: z.literal("boolean"),
  ...slotBase,
  default: z.boolean().optional(),
})
const ScalarSlotDefSchema = z.discriminatedUnion("type", [
  ImageSlotDefSchema,
  TextSlotDefSchema,
  ColorSlotDefSchema,
  NumberSlotDefSchema,
  BooleanSlotDefSchema,
])
export const SlotDefSchema: z.ZodType<SlotDef> = z.discriminatedUnion("type", [
  ImageSlotDefSchema,
  TextSlotDefSchema,
  ColorSlotDefSchema,
  NumberSlotDefSchema,
  BooleanSlotDefSchema,
  z.strictObject({
    type: z.literal("list"),
    ...slotBase,
    minItems: z.number().int().min(0).max(SPEC_LIMITS.maxSlides).optional(),
    maxItems: z.number().int().min(1).max(SPEC_LIMITS.maxSlides * SPEC_LIMITS.maxLayersPerSlide).optional(),
    item: z.record(z.string().regex(SLOT_NAME_RE), ScalarSlotDefSchema),
  }),
])

export const ConditionSchema: z.ZodType<Condition> = z.union([
  z.boolean(),
  SlotRefSchema,
  z.strictObject({ not: SlotRefSchema }),
])

const layerBaseShape = {
  id: z.string().regex(ID_RE, { error: "Layer ids are 1–128 chars of letters, digits, _ . - ~ space or {{vars}}." }),
  name: z.string().max(128).optional(),
  frame: FrameSchema.optional(),
  opacity: valued(z.number().min(0).max(1)).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  z: z.number().int().optional(),
  if: ConditionSchema.optional(),
  shadow: ShadowSchema.optional(),
}

const imagePropsShape = {
  fit: z.enum(["cover", "contain", "fill", "none"]).optional(),
  focal: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  zoom: z.number().min(1).max(10).optional(),
  cornerRadius: LengthSchema.optional(),
  clip: z.enum(["rect", "ellipse"]).optional(),
  border: StrokeSchema.optional(),
  backdrop: PaintSchema.optional(),
  filters: z
    .strictObject({
      brightness: z.number().min(-1).max(1).optional(),
      contrast: z.number().min(-1).max(1).optional(),
      saturation: z.number().min(-1).max(1).optional(),
      grayscale: z.boolean().optional(),
      blur: z.number().min(0).max(1).optional(),
      tint: z.strictObject({ color: ColorValueSchema, opacity: z.number().min(0).max(1) }).optional(),
    })
    .optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
}

const ImageLayerSchema = z.strictObject({
  ...layerBaseShape,
  type: z.literal("image"),
  src: z.union([ImageSourceSchema, SlotRefSchema], {
    error: 'Expected an image source or a slot binding like {"slot": "hero"}.',
  }),
  ...imagePropsShape,
})

const SpanSchema = z.strictObject({
  text: valued(z.string().max(10_000)),
  style: TextStyleSchema.optional(),
})
const TextLayerSchema = z.strictObject({
  ...layerBaseShape,
  type: z.literal("text"),
  text: z.union([z.string().max(10_000), SlotRefSchema, z.array(SpanSchema).min(1).max(200)]),
  markup: z.enum(["none", "emphasis"]).optional(),
  style: z
    .union([z.string().min(1).max(64), TextStyleSchema, z.tuple([z.string().min(1).max(64), TextStyleSchema])])
    .optional(),
  emphasisStyle: TextStyleSchema.optional(),
})

const ShapeLayerSchema = z.strictObject({
  ...layerBaseShape,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "line"]),
  fill: valued(PaintSchema).optional(),
  stroke: StrokeSchema.optional(),
  cornerRadius: LengthSchema.optional(),
})

export const GroupLayoutSchema: z.ZodType<GroupLayout> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("absolute") }),
  z.strictObject({
    type: z.literal("stack"),
    direction: z.enum(["vertical", "horizontal"]),
    gap: LengthSchema.optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: z.enum(["start", "center", "end", "space-between"]).optional(),
  }),
  z.strictObject({
    type: z.literal("grid"),
    columns: z.number().int().min(1).max(12),
    rows: z.number().int().min(1).max(12).optional(),
    gap: LengthSchema.optional(),
    cellAspect: z.number().positive().max(20).optional(),
  }),
])

const RepeatDirectiveSchema = z.strictObject({
  slot: z.string().regex(SLOT_NAME_RE),
  as: z.string().regex(SLOT_NAME_RE).optional(),
})

const GroupLayerSchema = z.strictObject({
  ...layerBaseShape,
  type: z.literal("group"),
  layout: GroupLayoutSchema.optional(),
  clip: z.boolean().optional(),
  cornerRadius: LengthSchema.optional(),
  background: PaintSchema.optional(),
  padding: Insets.optional(),
  get children(): z.ZodArray<z.ZodType<LayerEntry>> {
    return z.array(LayerEntrySchema).max(SPEC_LIMITS.maxLayersPerSlide)
  },
})

export const LayerSchema: z.ZodType<Layer> = z.lazy(() =>
  z.discriminatedUnion("type", [ImageLayerSchema, TextLayerSchema, ShapeLayerSchema, GroupLayerSchema])
) as z.ZodType<Layer>

export const LayerEntrySchema: z.ZodType<LayerEntry> = z.lazy(() =>
  z.union([z.strictObject({ repeat: RepeatDirectiveSchema, layer: LayerSchema }), LayerSchema])
)

export const SlideSchema: z.ZodType<Slide> = z.strictObject({
  id: z.string().regex(ID_RE, { error: "Slide ids are 1–128 chars of letters, digits, _ . - ~ space or {{vars}}." }),
  name: z.string().max(128).optional(),
  if: ConditionSchema.optional(),
  background: valued(PaintSchema).optional(),
  layers: z.array(LayerEntrySchema).max(SPEC_LIMITS.maxLayersPerSlide),
})

export const SlideEntrySchema: z.ZodType<SlideEntry> = z.union([
  z.strictObject({ repeat: RepeatDirectiveSchema, slide: SlideSchema }),
  SlideSchema,
])

export const SlideshowSpecSchema: z.ZodType<SlideshowSpec> = z.strictObject({
  $schema: z.string().max(512).optional(),
  version: z.literal(1),
  id: z.string().max(128).optional(),
  name: z.string().max(255).optional(),
  description: z.string().max(4000).optional(),
  canvas: CanvasSchema,
  fonts: z.array(FontRefSchema).max(SPEC_LIMITS.maxFonts).optional(),
  theme: ThemeSchema.optional(),
  defaults: z
    .strictObject({
      text: TextStyleSchema.optional(),
      image: z.strictObject(imagePropsShape).optional(),
    })
    .optional(),
  slots: z.record(z.string().regex(SLOT_NAME_RE), SlotDefSchema).optional(),
  slides: z.array(SlideEntrySchema).min(1).max(SPEC_LIMITS.maxSlides),
  meta: z.record(z.string(), z.unknown()).optional(),
})

// ───────────── render request (API / MCP input) ─────────────

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export type RenderOutputOptions = {
  /** Default "png". */
  format?: OutputFormat
  /** jpeg/webp only, 0..1. */
  quality?: number
  /** 0.5..2 multiplier on canvas px; default 1. */
  scale?: number
  /** Also produce a ZIP of all slides. */
  zip?: boolean
}
export const RenderOutputOptionsSchema: z.ZodType<RenderOutputOptions> = z.strictObject({
  format: z.enum(OUTPUT_FORMATS).optional(),
  quality: z.number().min(0).max(1).optional(),
  scale: z.number().min(0.5).max(2).optional(),
  zip: z.boolean().optional(),
})

export type RenderRequest = {
  /** XOR `spec`. A stored template id or a starter template id. */
  templateId?: string
  spec?: SlideshowSpec
  slotValues?: SlotValues
  output?: RenderOutputOptions
  /** Filenames and ZIP slug. */
  title?: string
  /** Wait for completion (sync) when the render is small enough. */
  wait?: boolean
  idempotencyKey?: string
}
export const RenderRequestSchema: z.ZodType<RenderRequest> = z
  .strictObject({
    templateId: z.string().min(1).max(64).optional(),
    spec: SlideshowSpecSchema.optional(),
    slotValues: z.record(z.string(), z.unknown()).optional(),
    output: RenderOutputOptionsSchema.optional(),
    title: z.string().max(512).optional(),
    wait: z.boolean().optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .refine((r) => (r.templateId === undefined) !== (r.spec === undefined), {
    error: 'Provide exactly one of "templateId" or "spec".',
  })

/** JSON Schema (draft 2020-12) for spec v1, for the API, MCP and offline validation. */
export function getSpecJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(SlideshowSpecSchema, {
    target: "draft-2020-12",
    unrepresentable: "any",
    cycles: "ref",
  }) as Record<string, unknown>
  return {
    ...schema,
    $id: "https://lumenclip.app/schemas/slideshow-spec-v1.json",
    title: "LumenClip slideshow spec v1",
  }
}

// ─────────────────────────────── zod → issues ───────────────────────────────

type RawIssue = z.core.$ZodIssue

function isMissingKeyIssue(issue: RawIssue): boolean {
  return issue.code === "invalid_type" && /received undefined/.test(issue.message)
}

/** A branch issue meaning "this union branch does not apply at all". */
function isFatalBranchIssue(issue: RawIssue): boolean {
  if (isMissingKeyIssue(issue)) return true
  return (
    issue.path.length === 0 &&
    (issue.code === "invalid_type" ||
      issue.code === "invalid_union" ||
      issue.code === "invalid_value" ||
      issue.code === "invalid_format")
  )
}

function flattenZodIssues(issues: readonly RawIssue[], prefix: PropertyKey[] = []): SpecIssue[] {
  const out: SpecIssue[] = []
  for (const issue of issues) {
    const path = [...prefix, ...issue.path]
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      // Report the branch that matched best (no "does not apply" failures);
      // otherwise the union-level message (e.g. "Expected a number or …").
      const scored = issue.errors.map((branch) => ({
        branch,
        score: branch.filter(isFatalBranchIssue).length * 1000 + branch.length,
        applies: !branch.some(isFatalBranchIssue),
      }))
      scored.sort((a, b) => a.score - b.score)
      const best = scored[0]
      if (best && best.applies) {
        out.push(...flattenZodIssues(best.branch, path))
        continue
      }
      out.push({ code: "schema.invalid_type", path: jsonPointer(path as (string | number)[]), message: issue.message })
      continue
    }
    out.push({
      code: `schema.${issue.code}`,
      path: jsonPointer(path as (string | number)[]),
      message: issue.message,
    })
  }
  return out
}

/** Structural parse only. */
export function parseSpec(input: unknown): { ok: true; spec: SlideshowSpec } | { ok: false; errors: SpecIssue[] } {
  const parsed = SlideshowSpecSchema.safeParse(input)
  if (parsed.success) return { ok: true, spec: parsed.data }
  return { ok: false, errors: flattenZodIssues(parsed.error.issues) }
}

// ─────────────────────────────── helpers ───────────────────────────────

export function isSlotRef(value: unknown): value is SlotRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { slot?: unknown }).slot === "string" &&
    Object.keys(value).length === 1
  )
}

export function isLayerRepeat(entry: LayerEntry): entry is LayerRepeat {
  return "repeat" in entry && "layer" in entry
}

export function isSlideRepeat(entry: SlideEntry): entry is SlideRepeat {
  return "repeat" in entry && "slide" in entry
}

export function isTemplate(spec: SlideshowSpec): boolean {
  return !!spec.slots && Object.keys(spec.slots).length > 0
}

/** Resolves canvas width/height from preset/width/height. Returns null when underspecified. */
export function canvasSize(canvas: Canvas): { width: number; height: number } | null {
  if (canvas.width !== undefined && canvas.height !== undefined) {
    return { width: canvas.width, height: canvas.height }
  }
  if (!canvas.preset) return null
  const [rw, rh] = CANVAS_PRESETS[canvas.preset]
  if (canvas.height !== undefined && canvas.width === undefined) {
    return { width: Math.round((canvas.height * rw) / rh), height: canvas.height }
  }
  const width = canvas.width ?? DEFAULT_CANVAS_WIDTH
  return { width, height: Math.round((width * rh) / rw) }
}

/** Deterministic 32-bit FNV-1a hash. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seeded deterministic index in [0, length). Same seed + length → same index. */
export function seededIndex(seed: string, length: number): number {
  if (length <= 0) throw new RangeError("seededIndex length must be > 0")
  return fnv1a(seed) % length
}

/** Canonical JSON: sorted object keys, no whitespace. Used for render hashes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`
}

function isTruthyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

const VAR_RE = /\{\{\{\{|\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\}\}/g

function templateVars(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(VAR_RE)) if (m[1]) out.push(m[1])
  return out
}

const BUILTIN_REPEAT_VARS = new Set(["index", "index1"])
const BUILTIN_GLOBAL_VARS = new Set(["slideIndex1", "slideCount"])

// ─────────────────────────────── slot values ───────────────────────────────

function checkScalarValue(
  def: ScalarSlotDef,
  value: unknown,
  path: (string | number)[],
  label: string,
  errors: SpecIssue[]
): void {
  const p = jsonPointer(path)
  const typeError = (expected: string): void => {
    errors.push({ code: "slot.type", path: p, message: `Slot "${label}" (${def.type}) expects ${expected}.` })
  }
  switch (def.type) {
    case "text":
      if (typeof value !== "string") return typeError("a string")
      if (def.maxLength !== undefined && value.length > def.maxLength) {
        errors.push({
          code: "slot.max_length",
          path: p,
          message: `Slot "${label}" is ${value.length} characters; the maximum is ${def.maxLength}.`,
        })
      }
      return
    case "color":
      if (typeof value !== "string" || !LITERAL_COLOR_RE.test(value)) return typeError('a colour like "#F4EFE6"')
      return
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return typeError("a number")
      if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) {
        errors.push({
          code: "slot.range",
          path: p,
          message: `Slot "${label}" must be between ${def.min ?? "-∞"} and ${def.max ?? "∞"}.`,
        })
      }
      return
    case "boolean":
      if (typeof value !== "boolean") return typeError("true or false")
      return
    case "image":
      if (typeof value === "string") {
        if (!/^https:\/\/\S+$/.test(value)) typeError("an https:// URL or an image source object")
        return
      }
      if (!ImageSourceSchema.safeParse(value).success) {
        typeError('{"media": id}, {"url": "https://…"} or {"collection": id, "pick": "random", "seed": "…"}')
      }
      return
  }
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null
}

/** Instance-level validation of slot values against slot definitions. Paths are `/slotValues/...`. */
export function validateSlotValues(
  slots: Record<string, SlotDef> | undefined,
  values: unknown
): { errors: SpecIssue[]; warnings: SpecIssue[] } {
  const errors: SpecIssue[] = []
  const warnings: SpecIssue[] = []
  const defs = slots ?? {}
  if (values === undefined || values === null) values = {}
  if (typeof values !== "object" || Array.isArray(values)) {
    errors.push({ code: "slot.type", path: "/slotValues", message: "slotValues must be an object." })
    return { errors, warnings }
  }
  const record = values as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!(key in defs)) {
      warnings.push({
        code: "slot.unused",
        path: jsonPointer(["slotValues", key]),
        message: `Slot "${key}" is not declared by this spec and is ignored.`,
      })
    }
  }
  for (const [name, def] of Object.entries(defs)) {
    const value = record[name]
    const path: (string | number)[] = ["slotValues", name]
    if (def.type === "list") {
      const items = isMissing(value) ? [] : value
      if (!Array.isArray(items)) {
        errors.push({ code: "slot.type", path: jsonPointer(path), message: `Slot "${name}" (list) expects an array.` })
        continue
      }
      const min = def.minItems ?? 0
      const max = def.maxItems ?? Infinity
      if (items.length < min || items.length > max) {
        errors.push({
          code: "slot.list_bounds",
          path: jsonPointer(path),
          message: `Slot "${name}" has ${items.length} items; it needs ${min}${
            Number.isFinite(max) ? `–${max}` : " or more"
          }.`,
        })
      }
      items.forEach((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          errors.push({
            code: "slot.type",
            path: jsonPointer([...path, i]),
            message: `Items of slot "${name}" must be objects.`,
          })
          return
        }
        const obj = item as Record<string, unknown>
        for (const key of Object.keys(obj)) {
          if (!(key in def.item)) {
            warnings.push({
              code: "slot.unused",
              path: jsonPointer([...path, i, key]),
              message: `Field "${key}" is not declared by list slot "${name}" and is ignored.`,
            })
          }
        }
        for (const [field, fieldDef] of Object.entries(def.item)) {
          const fv = obj[field]
          const label = `${name}[${i}].${field}`
          if (isMissing(fv)) {
            if ("required" in fieldDef && fieldDef.required && fieldDef.default === undefined) {
              errors.push({
                code: "slot.required",
                path: jsonPointer([...path, i, field]),
                message: `Slot "${label}" (${fieldDef.type}) is required.`,
              })
            }
            continue
          }
          checkScalarValue(fieldDef, fv, [...path, i, field], label, errors)
        }
      })
      continue
    }
    if (isMissing(value)) {
      if ("required" in def && def.required && def.default === undefined) {
        errors.push({ code: "slot.required", path: jsonPointer(path), message: `Slot "${name}" (${def.type}) is required.` })
      }
      continue
    }
    checkScalarValue(def, value, path, name, errors)
  }
  return { errors, warnings }
}

// ─────────────────────────────── semantic validation ───────────────────────────────

type ScopeAliases = Map<string, { listSlot: string; fields: Record<string, ScalarSlotDef> }>

type SemanticCtx = {
  spec: SlideshowSpec
  slots: Record<string, SlotDef>
  fonts: readonly FontFaceInfo[]
  errors: SpecIssue[]
  warnings: SpecIssue[]
}

function lookupSlotDef(
  ref: string,
  aliases: ScopeAliases
): { kind: "slot"; def: SlotDef } | { kind: "field"; def: ScalarSlotDef } | { kind: "builtin" } | null {
  const [head, field] = ref.split(".")
  if (field === undefined) {
    if (BUILTIN_GLOBAL_VARS.has(head)) return { kind: "builtin" }
    if (BUILTIN_REPEAT_VARS.has(head)) return aliases.size > 0 ? { kind: "builtin" } : null
    return null
  }
  const alias = aliases.get(head)
  if (alias) {
    const def = alias.fields[field]
    return def ? { kind: "field", def } : null
  }
  return null
}

function checkRef(ctx: SemanticCtx, ref: string, aliases: ScopeAliases, path: (string | number)[], expect?: SlotType): void {
  const isVar = !ref.includes(".") && !BUILTIN_GLOBAL_VARS.has(ref) && !BUILTIN_REPEAT_VARS.has(ref)
  const found = isVar ? (ctx.slots[ref] ? { kind: "slot" as const, def: ctx.slots[ref] } : null) : lookupSlotDef(ref, aliases)
  if (!found) {
    ctx.errors.push({
      code: "slot.unknown",
      path: jsonPointer(path),
      message: `"${ref}" is not a declared slot${aliases.size ? ", repeat field" : ""} or built-in variable.`,
    })
    return
  }
  if (expect && found.kind !== "builtin" && found.def.type !== expect) {
    ctx.errors.push({
      code: "slot.wrong_kind",
      path: jsonPointer(path),
      message: `"${ref}" is a ${found.def.type} slot; a ${expect} slot is required here.`,
    })
  }
}

function checkCondition(ctx: SemanticCtx, cond: Condition | undefined, aliases: ScopeAliases, path: (string | number)[]): void {
  if (cond === undefined || typeof cond === "boolean") return
  if ("not" in cond) checkRef(ctx, cond.not.slot, aliases, [...path, "not", "slot"])
  else checkRef(ctx, cond.slot, aliases, [...path, "slot"])
}

function checkText(ctx: SemanticCtx, text: string, aliases: ScopeAliases, path: (string | number)[]): void {
  for (const v of templateVars(text)) checkRef(ctx, v, aliases, path)
}

function checkColorToken(ctx: SemanticCtx, value: unknown, path: (string | number)[]): void {
  if (typeof value !== "string" || !value.startsWith("$")) return
  const m = /^\$([A-Za-z_][A-Za-z0-9_-]*)\.(.+)$/.exec(value)
  if (!m || m[1] !== "colors" || ctx.spec.theme?.colors?.[m[2]] === undefined) {
    ctx.errors.push({
      code: "token.unknown",
      path: jsonPointer(path),
      message: `Colour token "${value}" does not resolve; use "$colors.<name>" with a name from theme.colors.`,
    })
  }
}

function checkPaintTokens(ctx: SemanticCtx, paint: unknown, aliases: ScopeAliases, path: (string | number)[], expect: SlotType = "color"): void {
  if (paint === undefined) return
  if (isSlotRef(paint)) return checkRef(ctx, paint.slot, aliases, [...path, "slot"], expect)
  if (typeof paint === "string") return checkColorToken(ctx, paint, path)
  if (typeof paint === "object" && paint !== null && "stops" in paint) {
    ;(paint as LinearGradient).stops.forEach((s, i) => checkColorToken(ctx, s.color, [...path, "stops", i, "color"]))
  }
}

function resolveFamilyToken(spec: SlideshowSpec, family: string): string | null {
  if (!family.startsWith("$")) return family
  const m = /^\$fonts\.(.+)$/.exec(family)
  return m ? spec.theme?.fonts?.[m[1]] ?? null : null
}

function checkStyleTokens(ctx: SemanticCtx, style: Partial<TextStyle> | undefined, aliases: ScopeAliases, path: (string | number)[]): void {
  if (!style) return
  if (style.fontFamily !== undefined) {
    const fam = resolveFamilyToken(ctx.spec, style.fontFamily)
    if (fam === null) {
      ctx.errors.push({
        code: "token.unknown",
        path: jsonPointer([...path, "fontFamily"]),
        message: `Font token "${style.fontFamily}" does not resolve; use "$fonts.<name>" with a name from theme.fonts.`,
      })
    } else if (!ctx.fonts.some((f) => f.family === fam)) {
      ctx.errors.push({
        code: "font.unknown",
        path: jsonPointer([...path, "fontFamily"]),
        message: `Font family "${fam}" is not in the font registry.`,
      })
    }
  }
  checkPaintTokens(ctx, style.color, aliases, [...path, "color"])
  if (style.stroke) checkPaintTokens(ctx, style.stroke.color, aliases, [...path, "stroke", "color"])
  if (style.shadow) checkColorToken(ctx, style.shadow.color, [...path, "shadow", "color"])
  if (style.background) checkPaintTokens(ctx, style.background.color, aliases, [...path, "background", "color"])
}

/**
 * The weight must exist for the family. `fontStyle: "italic"` without an
 * italic face is allowed: the engine synthesizes an oblique.
 */
function checkFontWeight(ctx: SemanticCtx, family: string | undefined, weight: number | undefined, path: (string | number)[]): void {
  const fam = resolveFamilyToken(ctx.spec, family ?? TEXT_STYLE_DEFAULTS.fontFamily)
  if (!fam) return
  const faces = ctx.fonts.filter((f) => f.family === fam)
  if (faces.length === 0) return // reported as font.unknown where the family is set
  const w = weight ?? TEXT_STYLE_DEFAULTS.fontWeight
  if (!faces.some((f) => f.weights.includes(w))) {
    const available = [...new Set(faces.flatMap((f) => f.weights))].join(", ")
    ctx.errors.push({
      code: "font.weight_unavailable",
      path: jsonPointer(path),
      message: `"${fam}" has no face at weight ${w} (available: ${available}).`,
    })
  }
}

function namedStyle(ctx: SemanticCtx, name: string, path: (string | number)[]): TextStyle | undefined {
  const s = ctx.spec.theme?.textStyles?.[name]
  if (!s) {
    ctx.errors.push({ code: "style.unknown", path: jsonPointer(path), message: `Text style "${name}" is not defined in theme.textStyles.` })
  }
  return s
}

function walkLayers(
  ctx: SemanticCtx,
  entries: LayerEntry[],
  aliases: ScopeAliases,
  path: (string | number)[],
  depth: number,
  parentLayout: GroupLayout["type"],
  ids: Map<string, string>,
  counter: { n: number }
): void {
  entries.forEach((entry, i) => {
    let layer: Layer
    let layerPath: (string | number)[]
    let scope = aliases
    if (isLayerRepeat(entry)) {
      const def = ctx.slots[entry.repeat.slot]
      const rpath = [...path, i, "repeat", "slot"]
      if (!def) {
        ctx.errors.push({ code: "slot.unknown", path: jsonPointer(rpath), message: `Repeat slot "${entry.repeat.slot}" is not declared.` })
      } else if (def.type !== "list") {
        ctx.errors.push({ code: "repeat.not_list", path: jsonPointer(rpath), message: `Repeat slot "${entry.repeat.slot}" is a ${def.type} slot, not a list.` })
      } else {
        scope = new Map(aliases)
        scope.set(entry.repeat.as ?? "item", { listSlot: entry.repeat.slot, fields: def.item })
      }
      layer = entry.layer
      layerPath = [...path, i, "layer"]
    } else {
      layer = entry
      layerPath = [...path, i]
    }
    counter.n++
    if (depth > SPEC_LIMITS.maxDepth) {
      ctx.errors.push({ code: "limits.depth", path: jsonPointer(layerPath), message: `Layers may nest at most ${SPEC_LIMITS.maxDepth} levels deep.` })
    }
    const prev = ids.get(layer.id)
    if (prev !== undefined) {
      ctx.errors.push({ code: "layer.duplicate_id", path: jsonPointer([...layerPath, "id"]), message: `Layer id "${layer.id}" is already used at ${prev} in this slide.` })
    } else {
      ids.set(layer.id, jsonPointer(layerPath))
    }
    checkText(ctx, layer.id, scope, [...layerPath, "id"])
    checkCondition(ctx, layer.if, scope, [...layerPath, "if"])
    if (isSlotRef(layer.opacity)) checkRef(ctx, layer.opacity.slot, scope, [...layerPath, "opacity", "slot"], "number")
    if (layer.shadow) checkColorToken(ctx, layer.shadow.color, [...layerPath, "shadow", "color"])
    if (layer.frame) {
      if (parentLayout !== "absolute" && (layer.frame.x !== undefined || layer.frame.y !== undefined || layer.frame.inset !== undefined)) {
        ctx.warnings.push({
          code: "layout.frame_ignored",
          path: jsonPointer([...layerPath, "frame"]),
          message: `Position fields are ignored for children of a ${parentLayout} group.`,
        })
      }
      if (layer.frame.inset !== undefined && (layer.frame.x !== undefined || layer.frame.y !== undefined || layer.frame.anchor !== undefined)) {
        ctx.warnings.push({
          code: "frame.inset_conflict",
          path: jsonPointer([...layerPath, "frame"]),
          message: "frame.inset wins; x, y and anchor are ignored.",
        })
      }
      if (layer.type !== "text" && layer.type !== "group" && layer.frame.width === "auto") {
        ctx.errors.push({ code: "schema.custom", path: jsonPointer([...layerPath, "frame", "width"]), message: 'width "auto" is only valid for text layers.' })
      }
    }
    switch (layer.type) {
      case "image": {
        if (isSlotRef(layer.src)) checkRef(ctx, layer.src.slot, scope, [...layerPath, "src", "slot"], "image")
        if (layer.border) checkPaintTokens(ctx, layer.border.color, scope, [...layerPath, "border", "color"])
        checkPaintTokens(ctx, layer.backdrop, scope, [...layerPath, "backdrop"])
        if (layer.filters?.tint) checkColorToken(ctx, layer.filters.tint.color, [...layerPath, "filters", "tint", "color"])
        break
      }
      case "text": {
        if (typeof layer.text === "string") checkText(ctx, layer.text, scope, [...layerPath, "text"])
        else if (isSlotRef(layer.text)) checkRef(ctx, layer.text.slot, scope, [...layerPath, "text", "slot"])
        else {
          layer.text.forEach((span, si) => {
            const sp = [...layerPath, "text", si]
            if (typeof span.text === "string") checkText(ctx, span.text, scope, [...sp, "text"])
            else checkRef(ctx, span.text.slot, scope, [...sp, "text", "slot"])
            checkStyleTokens(ctx, span.style, scope, [...sp, "style"])
          })
        }
        let merged: TextStyle = { ...(ctx.spec.defaults?.text ?? {}) }
        const style = layer.style
        if (typeof style === "string") {
          merged = { ...merged, ...(namedStyle(ctx, style, [...layerPath, "style"]) ?? {}) }
        } else if (Array.isArray(style)) {
          merged = { ...merged, ...(namedStyle(ctx, style[0], [...layerPath, "style", 0]) ?? {}), ...style[1] }
          checkStyleTokens(ctx, style[1], scope, [...layerPath, "style", 1])
        } else if (style) {
          merged = { ...merged, ...style }
          checkStyleTokens(ctx, style, scope, [...layerPath, "style"])
        }
        checkFontWeight(ctx, merged.fontFamily, merged.fontWeight, [...layerPath, "style"])
        checkStyleTokens(ctx, layer.emphasisStyle, scope, [...layerPath, "emphasisStyle"])
        if (layer.emphasisStyle && (layer.emphasisStyle.fontFamily || layer.emphasisStyle.fontWeight)) {
          checkFontWeight(
            ctx,
            layer.emphasisStyle.fontFamily ?? merged.fontFamily,
            layer.emphasisStyle.fontWeight ?? merged.fontWeight,
            [...layerPath, "emphasisStyle"]
          )
        }
        if (Array.isArray(layer.text)) {
          layer.text.forEach((span, si) => {
            if (span.style?.fontFamily || span.style?.fontWeight) {
              checkFontWeight(
                ctx,
                span.style.fontFamily ?? merged.fontFamily,
                span.style.fontWeight ?? merged.fontWeight,
                [...layerPath, "text", si, "style"]
              )
            }
          })
        }
        break
      }
      case "shape": {
        checkPaintTokens(ctx, layer.fill, scope, [...layerPath, "fill"])
        if (layer.stroke) checkPaintTokens(ctx, layer.stroke.color, scope, [...layerPath, "stroke", "color"])
        break
      }
      case "group": {
        checkPaintTokens(ctx, layer.background, scope, [...layerPath, "background"])
        walkLayers(ctx, layer.children, scope, [...layerPath, "children"], depth + 1, layer.layout?.type ?? "absolute", ids, counter)
        break
      }
    }
  })
}

function semanticValidate(spec: SlideshowSpec, fonts: readonly FontFaceInfo[]): { errors: SpecIssue[]; warnings: SpecIssue[] } {
  const ctx: SemanticCtx = { spec, slots: spec.slots ?? {}, fonts, errors: [], warnings: [] }
  if (!canvasSize(spec.canvas)) {
    ctx.errors.push({
      code: "canvas.size_required",
      path: "/canvas",
      message: 'Set canvas.preset (e.g. "9:16"), or both canvas.width and canvas.height.',
    })
  }
  checkPaintTokens(ctx, spec.canvas.background, new Map(), ["canvas", "background"])
  for (const [i, ref] of (spec.fonts ?? []).entries()) {
    const faces = fonts.filter((f) => f.family === ref.family)
    if (faces.length === 0) {
      ctx.errors.push({ code: "font.unknown", path: jsonPointer(["fonts", i, "family"]), message: `Font family "${ref.family}" is not in the font registry.` })
      continue
    }
    for (const w of ref.weights ?? []) {
      if (!faces.some((f) => f.weights.includes(w))) {
        ctx.errors.push({ code: "font.weight_unavailable", path: jsonPointer(["fonts", i, "weights"]), message: `"${ref.family}" has no face at weight ${w}.` })
      }
    }
  }
  for (const [name, family] of Object.entries(spec.theme?.fonts ?? {})) {
    if (!fonts.some((f) => f.family === family)) {
      ctx.errors.push({ code: "font.unknown", path: jsonPointer(["theme", "fonts", name]), message: `Font family "${family}" is not in the font registry.` })
    }
  }
  for (const [name, style] of Object.entries(spec.theme?.textStyles ?? {})) {
    checkStyleTokens(ctx, style, new Map(), ["theme", "textStyles", name])
  }
  checkStyleTokens(ctx, spec.defaults?.text, new Map(), ["defaults", "text"])
  if (spec.defaults?.image?.border) checkColorToken(ctx, spec.defaults.image.border.color, ["defaults", "image", "border", "color"])

  spec.slides.forEach((entry, i) => {
    let slide: Slide
    let slidePath: (string | number)[]
    let aliases: ScopeAliases = new Map()
    if (isSlideRepeat(entry)) {
      const def = ctx.slots[entry.repeat.slot]
      const rpath = ["slides", i, "repeat", "slot"]
      if (!def) {
        ctx.errors.push({ code: "slot.unknown", path: jsonPointer(rpath), message: `Repeat slot "${entry.repeat.slot}" is not declared.` })
      } else if (def.type !== "list") {
        ctx.errors.push({ code: "repeat.not_list", path: jsonPointer(rpath), message: `Repeat slot "${entry.repeat.slot}" is a ${def.type} slot, not a list.` })
      } else {
        aliases = new Map([[entry.repeat.as ?? "item", { listSlot: entry.repeat.slot, fields: def.item }]])
      }
      slide = entry.slide
      slidePath = ["slides", i, "slide"]
    } else {
      slide = entry
      slidePath = ["slides", i]
    }
    checkText(ctx, slide.id, aliases, [...slidePath, "id"])
    checkCondition(ctx, slide.if, aliases, [...slidePath, "if"])
    checkPaintTokens(ctx, slide.background, aliases, [...slidePath, "background"])
    const counter = { n: 0 }
    walkLayers(ctx, slide.layers, aliases, [...slidePath, "layers"], 1, "absolute", new Map(), counter)
    if (counter.n > SPEC_LIMITS.maxLayersPerSlide) {
      ctx.errors.push({ code: "limits.layers", path: jsonPointer([...slidePath, "layers"]), message: `A slide may have at most ${SPEC_LIMITS.maxLayersPerSlide} layers.` })
    }
  })
  return { errors: ctx.errors, warnings: ctx.warnings }
}

// ─────────────────────────────── resolve ───────────────────────────────

type Scope = {
  root: SlotValues
  aliases: Map<string, Record<string, unknown>>
  index?: number
  slideIndex1?: number
  slideCount?: number
}

function lookupValue(ref: string, scope: Scope): unknown {
  const [head, field] = ref.split(".")
  if (field !== undefined) return scope.aliases.get(head)?.[field]
  if (head === "index") return scope.index
  if (head === "index1") return scope.index === undefined ? undefined : scope.index + 1
  if (head === "slideIndex1") return scope.slideIndex1
  if (head === "slideCount") return scope.slideCount
  return scope.root[head]
}

function interpolate(text: string, scope: Scope): string {
  return text.replace(VAR_RE, (match, name: string | undefined) => {
    if (!name) return "{{"
    const v = lookupValue(name, scope)
    if (v === undefined || v === null) return ""
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v)
    return ""
  })
}

function evalCondition(cond: Condition | undefined, scope: Scope): boolean {
  if (cond === undefined) return true
  if (typeof cond === "boolean") return cond
  if ("not" in cond) return !isTruthyValue(lookupValue(cond.not.slot, scope))
  return isTruthyValue(lookupValue(cond.slot, scope))
}

type ResolveCtx = {
  spec: SlideshowSpec
  errors: SpecIssue[]
  assetKeys: Set<string>
}

function resolveColor(ctx: ResolveCtx, value: string, path: (string | number)[]): string {
  if (!value.startsWith("$")) return value
  const m = /^\$colors\.(.+)$/.exec(value)
  const resolved = m ? ctx.spec.theme?.colors?.[m[1]] : undefined
  if (resolved === undefined) {
    ctx.errors.push({ code: "token.unknown", path: jsonPointer(path), message: `Colour token "${value}" does not resolve.` })
    return "#000000"
  }
  return resolved
}

function resolvePaint(ctx: ResolveCtx, value: Valued<Paint>, scope: Scope, path: (string | number)[]): ResolvedPaint {
  if (isSlotRef(value)) {
    const v = lookupValue(value.slot, scope)
    if (typeof v !== "string") {
      ctx.errors.push({ code: "slot.type", path: jsonPointer(path), message: `Slot "${value.slot}" must provide a colour.` })
      return "#000000"
    }
    return resolveColor(ctx, v, path)
  }
  if (typeof value === "string") return resolveColor(ctx, value, path)
  return {
    ...value,
    stops: value.stops.map((s, i) => ({ ...s, color: resolveColor(ctx, s.color, [...path, "stops", i, "color"]) })),
  }
}

function resolveColorValued(ctx: ResolveCtx, value: Valued<ColorValue>, scope: Scope, path: (string | number)[]): string {
  return resolvePaint(ctx, value, scope, path) as string
}

function resolveStroke(ctx: ResolveCtx, stroke: Stroke | undefined, scope: Scope, path: (string | number)[]): ResolvedStroke | undefined {
  if (!stroke) return undefined
  return { ...stroke, color: resolveColorValued(ctx, stroke.color, scope, [...path, "color"]) }
}

function resolveShadow(ctx: ResolveCtx, shadow: Shadow | undefined, path: (string | number)[]): Shadow | undefined {
  if (!shadow) return undefined
  return { ...shadow, color: resolveColor(ctx, shadow.color, [...path, "color"]) }
}

function resolveStylePatch(ctx: ResolveCtx, style: Partial<TextStyle>, scope: Scope, path: (string | number)[]): ResolvedTextStylePatch {
  const out: Record<string, unknown> = { ...style }
  if (style.fontFamily !== undefined) out.fontFamily = resolveFamilyToken(ctx.spec, style.fontFamily) ?? TEXT_STYLE_DEFAULTS.fontFamily
  if (style.color !== undefined) out.color = resolvePaint(ctx, style.color, scope, [...path, "color"])
  if (style.stroke) out.stroke = resolveStroke(ctx, style.stroke, scope, [...path, "stroke"])
  if (style.shadow) out.shadow = resolveShadow(ctx, style.shadow, [...path, "shadow"])
  if (style.background) {
    out.background = { ...style.background, color: resolveColorValued(ctx, style.background.color, scope, [...path, "background", "color"]) }
  }
  return out as ResolvedTextStylePatch
}

function resolveTextStyle(ctx: ResolveCtx, style: TextLayer["style"], scope: Scope, path: (string | number)[]): ResolvedTextStyle {
  const named = (name: string) => ctx.spec.theme?.textStyles?.[name] ?? {}
  let merged: TextStyle = { ...(ctx.spec.defaults?.text ?? {}) }
  if (typeof style === "string") merged = { ...merged, ...named(style) }
  else if (Array.isArray(style)) merged = { ...merged, ...named(style[0]), ...style[1] }
  else if (style) merged = { ...merged, ...style }
  const patch = resolveStylePatch(ctx, merged, scope, path)
  const fontSize = patch.fontSize ?? TEXT_STYLE_DEFAULTS.fontSize
  return {
    ...TEXT_STYLE_DEFAULTS,
    ...patch,
    fontSize,
    overflow: patch.overflow ?? (typeof fontSize === "number" ? "error" : "shrink"),
  } as ResolvedTextStyle
}

function resolveImageSource(ctx: ResolveCtx, src: ImageSource | SlotRef, scope: Scope, path: (string | number)[]): ResolvedImageSource | null {
  const raw = isSlotRef(src) ? lookupValue(src.slot, scope) : src
  if (raw === undefined || raw === null) return null
  if (typeof raw === "string") {
    ctx.assetKeys.add(`url:${raw}`)
    return { url: raw }
  }
  if (typeof raw === "object" && "media" in raw && typeof raw.media === "string") {
    ctx.assetKeys.add(`media:${raw.media}`)
    return raw as ResolvedImageSource
  }
  if (typeof raw === "object" && "url" in raw && typeof raw.url === "string") {
    ctx.assetKeys.add(`url:${raw.url}`)
    return { url: raw.url }
  }
  ctx.errors.push({
    code: "asset.collection_unresolved",
    path: jsonPointer(path),
    message: "Collection image sources must be resolved before rendering.",
  })
  return null
}

function uniqueId(raw: string, scope: Scope, repeated: boolean, index: number): string {
  const id = interpolate(raw, scope)
  return repeated && id === raw ? `${id}~${index}` : id
}

function resolveLayerEntries(
  ctx: ResolveCtx,
  entries: LayerEntry[],
  scope: Scope,
  path: (string | number)[],
  out: ResolvedLayer[]
): void {
  entries.forEach((entry, i) => {
    if (isLayerRepeat(entry)) {
      const items = lookupValue(entry.repeat.slot, scope)
      const list = Array.isArray(items) ? items : []
      list.forEach((item, n) => {
        const aliases = new Map(scope.aliases)
        aliases.set(entry.repeat.as ?? "item", (item ?? {}) as Record<string, unknown>)
        const inner: Scope = { ...scope, aliases, index: n }
        const layer = resolveLayer(ctx, entry.layer, inner, [...path, i, "layer"], true, n)
        if (layer) out.push(layer)
      })
      return
    }
    const layer = resolveLayer(ctx, entry, scope, [...path, i], false, 0)
    if (layer) out.push(layer)
  })
}

function resolveLayer(
  ctx: ResolveCtx,
  layer: Layer,
  scope: Scope,
  path: (string | number)[],
  repeated: boolean,
  index: number
): ResolvedLayer | null {
  if (!evalCondition(layer.if, scope)) return null
  const opacityRaw = isSlotRef(layer.opacity) ? lookupValue(layer.opacity.slot, scope) : layer.opacity
  const base: ResolvedLayerBase = {
    id: uniqueId(layer.id, scope, repeated, index),
    ...(layer.name !== undefined ? { name: interpolate(layer.name, scope) } : {}),
    ...(layer.frame ? { frame: layer.frame } : {}),
    opacity: typeof opacityRaw === "number" ? Math.min(1, Math.max(0, opacityRaw)) : 1,
    rotation: layer.rotation ?? 0,
    ...(layer.z !== undefined ? { z: layer.z } : {}),
    ...(layer.shadow ? { shadow: resolveShadow(ctx, layer.shadow, [...path, "shadow"]) } : {}),
  }
  switch (layer.type) {
    case "image": {
      const src = resolveImageSource(ctx, layer.src, scope, [...path, "src"])
      if (!src) return null // unbound optional image slot: the layer is omitted
      const d = ctx.spec.defaults?.image ?? {}
      const { src: _src, type: _type, id: _id, name: _name, frame: _frame, opacity: _o, rotation: _r, z: _z, if: _if, shadow: _s, ...props } = layer
      const merged = { ...d, ...props }
      return {
        ...base,
        type: "image",
        ...merged,
        src,
        fit: merged.fit ?? "cover",
        focal: merged.focal ?? { x: 0.5, y: 0.5 },
        zoom: merged.zoom ?? 1,
        border: resolveStroke(ctx, merged.border, scope, [...path, "border"]),
        backdrop: merged.backdrop === undefined ? undefined : resolvePaint(ctx, merged.backdrop, scope, [...path, "backdrop"]),
        filters: merged.filters?.tint
          ? { ...merged.filters, tint: { ...merged.filters.tint, color: resolveColor(ctx, merged.filters.tint.color, [...path, "filters", "tint", "color"]) } }
          : merged.filters,
      } as ResolvedImageLayer
    }
    case "text": {
      let text: string | ResolvedSpan[]
      if (typeof layer.text === "string") text = interpolate(layer.text, scope)
      else if (isSlotRef(layer.text)) {
        const v = lookupValue(layer.text.slot, scope)
        text = v === undefined || v === null ? "" : String(v)
      } else {
        text = layer.text.map((span, si) => {
          const raw = isSlotRef(span.text) ? lookupValue(span.text.slot, scope) : interpolate(span.text, scope)
          return {
            text: raw === undefined || raw === null ? "" : String(raw),
            ...(span.style ? { style: resolveStylePatch(ctx, span.style, scope, [...path, "text", si, "style"]) } : {}),
          }
        })
      }
      return {
        ...base,
        type: "text",
        text,
        markup: layer.markup ?? "none",
        style: resolveTextStyle(ctx, layer.style, scope, [...path, "style"]),
        ...(layer.emphasisStyle ? { emphasisStyle: resolveStylePatch(ctx, layer.emphasisStyle, scope, [...path, "emphasisStyle"]) } : {}),
      }
    }
    case "shape":
      return {
        ...base,
        type: "shape",
        shape: layer.shape,
        ...(layer.fill !== undefined ? { fill: resolvePaint(ctx, layer.fill, scope, [...path, "fill"]) } : {}),
        ...(layer.stroke ? { stroke: resolveStroke(ctx, layer.stroke, scope, [...path, "stroke"]) } : {}),
        ...(layer.cornerRadius !== undefined ? { cornerRadius: layer.cornerRadius } : {}),
      }
    case "group": {
      const children: ResolvedLayer[] = []
      resolveLayerEntries(ctx, layer.children, scope, [...path, "children"], children)
      return {
        ...base,
        type: "group",
        layout: layer.layout ?? { type: "absolute" },
        ...(layer.clip !== undefined ? { clip: layer.clip } : {}),
        ...(layer.cornerRadius !== undefined ? { cornerRadius: layer.cornerRadius } : {}),
        ...(layer.background !== undefined ? { background: resolvePaint(ctx, layer.background, scope, [...path, "background"]) } : {}),
        ...(layer.padding !== undefined ? { padding: layer.padding } : {}),
        children,
      }
    }
  }
}

function countLayers(layers: ResolvedLayer[]): number {
  return layers.reduce((n, l) => n + 1 + (l.type === "group" ? countLayers(l.children) : 0), 0)
}

/** Applies slot defaults and normalizes image values (`"https://…"` → `{url}`). */
export function applySlotDefaults(slots: Record<string, SlotDef> | undefined, values: SlotValues | undefined): SlotValues {
  const out: SlotValues = { ...(values ?? {}) }
  const normalize = (def: ScalarSlotDef, v: unknown): unknown => {
    if (isMissing(v)) return "default" in def && def.default !== undefined ? def.default : undefined
    if (def.type === "image" && typeof v === "string") return { url: v }
    return v
  }
  for (const [name, def] of Object.entries(slots ?? {})) {
    if (def.type === "list") {
      const items = Array.isArray(out[name]) ? (out[name] as unknown[]) : []
      out[name] = items.map((item) => {
        const obj = { ...((item ?? {}) as Record<string, unknown>) }
        for (const [field, fdef] of Object.entries(def.item)) {
          const v = normalize(fdef, obj[field])
          if (v === undefined) delete obj[field]
          else obj[field] = v
        }
        return obj
      })
      continue
    }
    const v = normalize(def, out[name])
    if (v === undefined) delete out[name]
    else out[name] = v
  }
  return out
}

/** Sync core: expects slot values with defaults applied and collection picks already resolved. */
function resolveCore(spec: SlideshowSpec, values: SlotValues): { spec: ResolvedSpec | null; errors: SpecIssue[] } {
  const ctx: ResolveCtx = { spec, errors: [], assetKeys: new Set() }
  const size = canvasSize(spec.canvas) ?? { width: DEFAULT_CANVAS_WIDTH, height: 1920 }
  const rootScope: Scope = { root: values, aliases: new Map() }
  const canvasBg = resolvePaint(ctx, spec.canvas.background ?? DEFAULT_CANVAS_BACKGROUND, rootScope, ["canvas", "background"])

  // 1. Expand slide repeats and drop falsy `if`.
  const expanded: { slide: Slide; scope: Scope; path: (string | number)[]; repeated: boolean; index: number }[] = []
  spec.slides.forEach((entry, i) => {
    if (isSlideRepeat(entry)) {
      const items = lookupValue(entry.repeat.slot, rootScope)
      ;(Array.isArray(items) ? items : []).forEach((item, n) => {
        const scope: Scope = {
          root: values,
          aliases: new Map([[entry.repeat.as ?? "item", (item ?? {}) as Record<string, unknown>]]),
          index: n,
        }
        if (evalCondition(entry.slide.if, scope)) {
          expanded.push({ slide: entry.slide, scope, path: ["slides", i, "slide"], repeated: true, index: n })
        }
      })
    } else if (evalCondition(entry.if, rootScope)) {
      expanded.push({ slide: entry, scope: rootScope, path: ["slides", i], repeated: false, index: 0 })
    }
  })
  if (expanded.length === 0) {
    ctx.errors.push({ code: "limits.slides", path: "/slides", message: "The spec produces no slides with these slot values." })
  }
  if (expanded.length > SPEC_LIMITS.maxSlides) {
    ctx.errors.push({
      code: "limits.slides",
      path: "/slides",
      message: `The spec expands to ${expanded.length} slides; the maximum is ${SPEC_LIMITS.maxSlides}.`,
    })
  }

  // 2. Materialize with slideIndex1/slideCount known.
  const slideCount = expanded.length
  const slides: ResolvedSlide[] = expanded.map(({ slide, scope, path, repeated, index }, n) => {
    const full: Scope = { ...scope, slideIndex1: n + 1, slideCount }
    const layers: ResolvedLayer[] = []
    resolveLayerEntries(ctx, slide.layers, full, [...path, "layers"], layers)
    if (countLayers(layers) > SPEC_LIMITS.maxLayersPerSlide) {
      ctx.errors.push({
        code: "limits.layers",
        path: jsonPointer([...path, "layers"]),
        slide: n,
        message: `Slide ${n + 1} has more than ${SPEC_LIMITS.maxLayersPerSlide} layers after expansion.`,
      })
    }
    return {
      id: uniqueId(slide.id, full, repeated, index),
      ...(slide.name !== undefined ? { name: interpolate(slide.name, full) } : {}),
      background: slide.background === undefined ? canvasBg : resolvePaint(ctx, slide.background, full, [...path, "background"]),
      layers,
    }
  })
  if (ctx.assetKeys.size > SPEC_LIMITS.maxImageAssets) {
    ctx.errors.push({ code: "limits.assets", path: "/slides", message: `A render may use at most ${SPEC_LIMITS.maxImageAssets} distinct images.` })
  }
  const seen = new Set<string>()
  slides.forEach((s, n) => {
    if (seen.has(s.id)) {
      ctx.errors.push({ code: "layer.duplicate_id", path: jsonPointer(["slides", n, "id"]), slide: n, message: `Slide id "${s.id}" is used more than once.` })
    }
    seen.add(s.id)
  })
  if (ctx.errors.length) return { spec: null, errors: ctx.errors }
  return {
    errors: [],
    spec: {
      version: 1,
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      ...(spec.name !== undefined ? { name: spec.name } : {}),
      ...(spec.description !== undefined ? { description: spec.description } : {}),
      canvas: { ...size, background: canvasBg },
      fonts: spec.fonts ?? [],
      slides,
      ...(spec.meta !== undefined ? { meta: spec.meta } : {}),
    },
  }
}

export type ValidateSpecOptions = {
  /** When given, also runs the instance pass (slot values, expansion limits). */
  slotValues?: unknown
  /** Font registry; defaults to the bundled registry from `listFonts()`. */
  fonts?: readonly FontFaceInfo[]
}

/**
 * Validates a spec (template or instance) in three passes: structural (zod),
 * semantic (template level), and — when `slotValues` is given — instance.
 * Collection picks are not resolved here (no I/O).
 */
export function validateSpec(input: unknown, options: ValidateSpecOptions = {}): SpecValidationResult {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(input)
  } catch {
    return { ok: false, errors: [{ code: "spec.invalid_json", path: "", message: "The spec is not serializable JSON." }], warnings: [] }
  }
  if (serialized !== undefined && serialized.length > SPEC_LIMITS.maxSpecBytes) {
    return {
      ok: false,
      errors: [{ code: "limits.spec_size", path: "", message: `The spec is larger than ${SPEC_LIMITS.maxSpecBytes / 1024} KB.` }],
      warnings: [],
    }
  }
  const parsed = parseSpec(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors, warnings: [] }
  const spec = parsed.spec
  const { errors, warnings } = semanticValidate(spec, options.fonts ?? listFonts())
  if (options.slotValues !== undefined && errors.length === 0) {
    const sv = validateSlotValues(spec.slots, options.slotValues)
    errors.push(...sv.errors)
    warnings.push(...sv.warnings)
    if (sv.errors.length === 0) {
      // Dry resolve with placeholder picks to check expansion limits.
      const values = applySlotDefaults(spec.slots, options.slotValues as SlotValues)
      const placeholder = replaceCollectionSources(spec.slots, values, () => ({ media: "pending-collection-pick" }))
      errors.push(...resolveCore(spec, placeholder).errors)
    }
  }
  return { ok: errors.length === 0, errors, warnings, spec }
}

/**
 * Lists the media ids of a collection in display order. Injected by the caller
 * (the data layer) so resolution stays pure. Returns `null` when the
 * collection does not exist or is not owned by the caller.
 */
export type CollectionMediaResolver = (collection: string) => Promise<readonly string[] | null>

export type ResolveTemplateOptions = {
  resolveCollection?: CollectionMediaResolver
  /** Fallback seed for `pick: "random"` sources that carry no seed. */
  seed?: string
  fonts?: readonly FontFaceInfo[]
}

type PendingPick = { path: (string | number)[]; source: CollectionImageSource }

function replaceCollectionSources(
  slots: Record<string, SlotDef> | undefined,
  values: SlotValues,
  replace: (pick: PendingPick) => ResolvedImageSource
): SlotValues {
  const isCollection = (v: unknown): v is CollectionImageSource =>
    typeof v === "object" && v !== null && "collection" in v
  const out: SlotValues = { ...values }
  for (const [name, def] of Object.entries(slots ?? {})) {
    if (def.type === "image" && isCollection(out[name])) {
      out[name] = replace({ path: [name], source: out[name] as CollectionImageSource })
    } else if (def.type === "list" && Array.isArray(out[name])) {
      out[name] = (out[name] as Record<string, unknown>[]).map((item, i) => {
        const copy = { ...item }
        for (const [field, fdef] of Object.entries(def.item)) {
          if (fdef.type === "image" && isCollection(copy[field])) {
            copy[field] = replace({ path: [name, i, field], source: copy[field] as CollectionImageSource })
          }
        }
        return copy
      })
    }
  }
  return out
}

/**
 * Resolves a template + slot values into a ResolvedSpec (doc 01 §2.4).
 * Pure apart from the injected collection resolver. Collection picks are
 * deterministic: `random` uses `seededIndex(seed + ":" + slotPath, n)`.
 * Throws `SpecError` with structured issues on any error.
 */
export async function resolveTemplate(
  template: SlideshowSpec,
  slotValues: SlotValues = {},
  options: ResolveTemplateOptions = {}
): Promise<ResolvedSpec> {
  const validation = validateSpec(template, { slotValues, fonts: options.fonts })
  if (!validation.ok || !validation.spec) throw new SpecError(validation.errors, validation.warnings)
  const spec = validation.spec
  const values = applySlotDefaults(spec.slots, slotValues)

  const pending: PendingPick[] = []
  replaceCollectionSources(spec.slots, values, (p) => {
    pending.push(p)
    return { media: "" }
  })
  const errors: SpecIssue[] = []
  const lists = new Map<string, readonly string[] | null>()
  for (const p of pending) {
    if (!options.resolveCollection) break
    if (!lists.has(p.source.collection)) lists.set(p.source.collection, await options.resolveCollection(p.source.collection))
  }
  const picks = new Map<string, ResolvedImageSource>()
  for (const p of pending) {
    const at = jsonPointer(["slotValues", ...p.path])
    if (!options.resolveCollection) {
      errors.push({ code: "asset.collection_unresolved", path: at, message: "Collection image sources need a collection resolver." })
      continue
    }
    const ids = lists.get(p.source.collection)
    if (!ids || ids.length === 0) {
      errors.push({ code: "asset.collection_empty", path: at, message: `Collection "${p.source.collection}" has no images or does not exist.` })
      continue
    }
    const pick = p.source.pick ?? "first"
    const seed = p.source.seed ?? options.seed ?? ""
    let index: number
    if (pick === "first") index = 0
    else if (pick === "random") index = seededIndex(`${seed}:${p.path.join("/")}`, ids.length)
    else index = pick
    if (index >= ids.length) {
      errors.push({ code: "asset.pick_out_of_range", path: at, message: `Collection "${p.source.collection}" has only ${ids.length} images.` })
      continue
    }
    picks.set(at, { media: ids[index], from: { collection: p.source.collection, pick, seed, index } })
  }
  if (errors.length) throw new SpecError(errors, validation.warnings)

  const bound = replaceCollectionSources(spec.slots, values, (p) => picks.get(jsonPointer(["slotValues", ...p.path]))!)
  const core = resolveCore(spec, bound)
  if (!core.spec) throw new SpecError(core.errors, validation.warnings)
  return core.spec
}
