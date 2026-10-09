/**
 * Render engine contract (docs/refactor/01-slideshow-json-spec.md §2.6, §7).
 *
 * The engine renders a ResolvedSpec to one raster image per slide with
 * Fabric.js 7 (`fabric/node` + node-canvas on the server; the same module
 * paints the browser preview). Server output is authoritative.
 *
 * Pipeline: `./pipeline` (assets → fonts → `./layout` → `./paint`), run on a
 * platform from `./platform`: the server loads `./node/platform` on first use;
 * the browser preview registers `./browser/platform` by importing
 * `@/lib/render/browser`. The font registry is the 21 bundled faces in
 * `assets/fonts/` plus Inter.
 *
 * Isomorphic: no Node APIs at module scope.
 */
import type {
  OutputFormat,
  ResolvedImageSource,
  ResolvedSpec,
  SpecIssue,
} from "./spec"

/** Bumped whenever output pixels may change for the same input (part of renderHash). */
export const ENGINE_VERSION = "1.0.0"

export const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const satisfies Record<OutputFormat, string>

export type RenderMime = (typeof MIME_BY_FORMAT)[OutputFormat]

/** Bytes and type of one source image, as delivered by an AssetLoader. */
export type LoadedAsset = { bytes: Uint8Array; mime: string }

/**
 * Fetches image bytes for a resolved source. Server implementations read
 * `{media}` from Appwrite Storage (ownership-checked) and fetch `{url}` with
 * the SSRF guard and size cap. Throws `AssetLoadError`.
 */
export interface AssetLoader {
  load(source: ResolvedImageSource): Promise<LoadedAsset>
}

export type RenderOptions = {
  format: OutputFormat
  /** 0.5..2 multiplier on canvas px. */
  scale: number
  /** jpeg/webp quality 0..1. */
  quality?: number
  /** 0-based indexes into `resolved.slides`; default all slides. */
  slides?: number[]
  /** Required whenever the spec contains image layers. */
  assets?: AssetLoader
}

export type RenderedSlide = {
  /** 0-based index into `resolved.slides`. */
  index: number
  /** `resolved.slides[index].id`. */
  id: string
  mime: RenderMime
  bytes: Uint8Array
  width: number
  height: number
}

export type RenderResult = {
  slides: RenderedSlide[]
  /** Layout/asset warnings (text.shrunk_below_min, asset.upscaled, …), with `slide` set. */
  warnings: SpecIssue[]
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`)
    this.name = "NotImplementedError"
  }
}

/** Raised by an AssetLoader; `code` maps to a SpecIssue code. */
export class AssetLoadError extends Error {
  readonly code: "asset.fetch_failed" | "asset.unsupported_type" | "asset.too_large"
  constructor(code: AssetLoadError["code"], message: string) {
    super(message)
    this.name = "AssetLoadError"
    this.code = code
  }
}

/** Raised by renderSpec for issues that fail a render (e.g. `text.overflow`). */
export class RenderError extends Error {
  readonly issues: SpecIssue[]
  constructor(issues: SpecIssue[]) {
    super(issues.map((i) => i.message).join("; ") || "Render failed")
    this.name = "RenderError"
    this.issues = issues
  }
}

/**
 * Renders a ResolvedSpec to one image per requested slide.
 * Throws `RenderError` (asset/text issues), `RangeError` (bad options).
 */
export async function renderSpec(
  resolved: ResolvedSpec,
  options: RenderOptions
): Promise<RenderResult> {
  const [{ getRenderPlatform }, { renderWithPlatform }] = await Promise.all([
    import("./platform"),
    import("./pipeline"),
  ])
  return renderWithPlatform(await getRenderPlatform(), resolved, options)
}

// ─────────────────────────────── fonts ───────────────────────────────

export type FontCategory = "Sans serif" | "Serif" | "Display" | "Script" | "Handwritten"

export type FontFaceInfo = {
  /** Stable family name used in specs. */
  family: string
  /** Weights this face file provides (a variable font lists several). */
  weights: number[]
  style: "normal" | "italic"
  /** File name inside `assets/fonts/`. */
  file: string
  category: FontCategory
  /** Variable font (one file, many weights). */
  variable?: boolean
}

const INTER_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

const single = (family: string, file: string, category: FontCategory, weight = 400): FontFaceInfo => ({
  family,
  weights: [weight],
  style: "normal",
  file,
  category,
})

const FONT_REGISTRY: readonly FontFaceInfo[] = Object.freeze([
  {
    family: "Inter",
    weights: INTER_WEIGHTS,
    style: "normal",
    file: "Inter-Variable.ttf",
    category: "Sans serif",
    variable: true,
  },
  single("Angelina", "Angelina.otf", "Script"),
  single("Backind Maldina", "Backind-Maldina.otf", "Serif"),
  single("Buffalo", "Buffalo-Regular.otf", "Script"),
  single("Casual Human", "CasualHuman-Regular.otf", "Handwritten", 400),
  single("Casual Human", "CasualHuman-Bold.otf", "Handwritten", 700),
  ...(["Regular", "Rough", "Smooth", "Texture"] as const).map((v) =>
    single(`Hertical Sans ${v}`, `HerticalSans-${v}.otf`, "Display")
  ),
  ...(["Regular", "Rough", "Smooth", "Texture"] as const).map((v) =>
    single(`Hertical Serif ${v}`, `HerticalSerif-${v}.otf`, "Display")
  ),
  single("Respano", "Respano.otf", "Display"),
  single("Rossen Serif", "Rossen-Serif.otf", "Serif"),
  single("Sunset Script", "Sunset-Script.otf", "Handwritten"),
  single("Superbusy Activity", "Superbusy-Activity-Regular.otf", "Handwritten"),
  single("Superbusy Activity Text", "Superbusy-Activity-Text.otf", "Handwritten"),
  single("Superbusy Activity Outline", "Superbusy-Activity-Outline.otf", "Display"),
  single("Thumpa", "Thumpa.otf", "Display"),
  single("Yoriglo", "Yoriglo.otf", "Script"),
])

/** The bundled font registry (repo `assets/fonts/`). No user uploads in v1. */
export function listFonts(): readonly FontFaceInfo[] {
  return FONT_REGISTRY
}

/** Unique family names in registry order. */
export function listFontFamilies(): string[] {
  return [...new Set(FONT_REGISTRY.map((f) => f.family))]
}

/** The face that renders `family` at `weight`/`style`, or null when unavailable. */
export function findFontFace(
  family: string,
  weight = 400,
  style: "normal" | "italic" = "normal"
): FontFaceInfo | null {
  return (
    FONT_REGISTRY.find(
      (f) => f.family === family && f.style === style && f.weights.includes(weight)
    ) ?? null
  )
}
