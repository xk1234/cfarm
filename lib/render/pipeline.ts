/**
 * The render pipeline behind `renderSpec` (doc 01 §2.1): collect assets →
 * load + decode → fonts → layout → paint → encode. Platform-agnostic.
 */
import { imageSourceKey, type DisplaySlide } from "./display-list"
import {
  AssetLoadError,
  MIME_BY_FORMAT,
  RenderError,
  type RenderOptions,
  type RenderResult,
  type RenderedSlide,
} from "./engine"
import { selectFontFace } from "./fonts"
import { layoutSlide } from "./layout/layout"
import { paintSlide } from "./paint/fabric-painter"
import type { DecodedImage, RenderPlatform } from "./platform"
import {
  jsonPointer,
  type ResolvedImageSource,
  type ResolvedLayer,
  type ResolvedSpec,
  type ResolvedTextStyle,
  type SpecIssue,
} from "./spec"

const ASSET_CONCURRENCY = 6

type AssetUse = { source: ResolvedImageSource; path: string; slide: number }

function walk(layers: ResolvedLayer[], path: (string | number)[], visit: (layer: ResolvedLayer, path: (string | number)[]) => void): void {
  layers.forEach((layer, i) => {
    const p = [...path, i]
    visit(layer, p)
    if (layer.type === "group") walk(layer.children, [...p, "children"], visit)
  })
}

function selectedSlides(resolved: ResolvedSpec, options: RenderOptions): number[] {
  const all = resolved.slides.map((_, i) => i)
  if (!options.slides) return all
  const out: number[] = []
  for (const i of options.slides) {
    if (!Number.isInteger(i) || i < 0 || i >= resolved.slides.length) {
      throw new RangeError(`Slide index ${i} is out of range (0..${resolved.slides.length - 1}).`)
    }
    if (!out.includes(i)) out.push(i)
  }
  return out
}

/** The faces every text layer on these slides draws with. */
function usedFaces(resolved: ResolvedSpec, slides: number[]): { family: string; weight: number }[] {
  const seen = new Map<string, { family: string; weight: number }>()
  const add = (style: Partial<ResolvedTextStyle>, base: ResolvedTextStyle) => {
    const face = selectFontFace(style.fontFamily ?? base.fontFamily, style.fontWeight ?? base.fontWeight)
    if (face) seen.set(`${face.family}@${face.weight}`, { family: face.family, weight: face.weight })
  }
  for (const s of slides) {
    walk(resolved.slides[s].layers, [], (layer) => {
      if (layer.type !== "text") return
      add(layer.style, layer.style)
      if (layer.emphasisStyle) add(layer.emphasisStyle, layer.style)
      if (Array.isArray(layer.text)) for (const span of layer.text) if (span.style) add(span.style, layer.style)
    })
  }
  return [...seen.values()]
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

export async function renderWithPlatform(platform: RenderPlatform, resolved: ResolvedSpec, options: RenderOptions): Promise<RenderResult> {
  const mime = MIME_BY_FORMAT[options.format]
  if (!mime) throw new RangeError(`Unsupported output format "${String(options.format)}".`)
  if (!(options.scale >= 0.5 && options.scale <= 2)) throw new RangeError("scale must be between 0.5 and 2.")
  if (options.quality !== undefined && !(options.quality >= 0 && options.quality <= 1)) {
    throw new RangeError("quality must be between 0 and 1.")
  }
  const slides = selectedSlides(resolved, options)

  // 1. Assets: each distinct source is loaded and decoded once.
  const uses = new Map<string, AssetUse>()
  for (const s of slides) {
    walk(resolved.slides[s].layers, ["slides", s, "layers"], (layer, path) => {
      if (layer.type !== "image") return
      const key = imageSourceKey(layer.src)
      if (!uses.has(key)) uses.set(key, { source: layer.src, path: jsonPointer([...path, "src"]), slide: s })
    })
  }
  const errors: SpecIssue[] = []
  const images = new Map<string, DecodedImage>()
  if (uses.size > 0 && !options.assets) {
    const first = uses.values().next().value as AssetUse
    throw new RenderError([{ code: "asset.fetch_failed", path: first.path, slide: first.slide, message: "No asset loader was provided for image layers." }])
  }
  await pool([...uses.entries()], ASSET_CONCURRENCY, async ([key, use]) => {
    try {
      const asset = await options.assets!.load(use.source)
      images.set(key, await platform.decodeImage(asset))
    } catch (err) {
      const code = err instanceof AssetLoadError ? err.code : "asset.fetch_failed"
      const detail = err instanceof Error ? err.message : String(err)
      errors.push({ code, path: use.path, slide: use.slide, message: `Image ${describe(use.source)} could not be used: ${detail}` })
    }
  })
  if (errors.length) throw new RenderError(sortIssues(errors))

  // 2. Fonts, then layout every slide before painting any.
  await platform.ensureFonts(usedFaces(resolved, slides))
  const measurer = platform.measurer()
  const warnings: SpecIssue[] = []
  const displays: DisplaySlide[] = []
  for (const s of slides) {
    const result = layoutSlide(resolved.slides[s], s, resolved.canvas, {
      measurer,
      imageSize: (key) => {
        const img = images.get(key)
        return img ? { width: img.width, height: img.height } : null
      },
    })
    errors.push(...result.errors)
    warnings.push(...result.warnings)
    displays.push(result.slide)
  }
  if (errors.length) throw new RenderError(sortIssues(errors))

  // 3. Paint + encode.
  const fabric = await platform.fabric()
  const canvas = new fabric.StaticCanvas(undefined, {
    width: resolved.canvas.width,
    height: resolved.canvas.height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  })
  const out: RenderedSlide[] = []
  try {
    for (const display of displays) {
      await paintSlide(canvas, display, {
        fabric,
        images,
        scale: options.scale,
        createCanvas: (w, h) => platform.createCanvas(w, h),
      })
      const bytes = await platform.encode(canvas, mime, options.quality)
      out.push({
        index: display.index,
        id: display.id,
        mime,
        bytes,
        width: Math.round(display.width * options.scale),
        height: Math.round(display.height * options.scale),
      })
    }
  } finally {
    await canvas.dispose()
  }
  return { slides: out, warnings: sortIssues(warnings) }
}

function describe(source: ResolvedImageSource): string {
  return "media" in source ? `media "${source.media}"` : `"${source.url.slice(0, 200)}"`
}

function sortIssues(issues: SpecIssue[]): SpecIssue[] {
  return [...issues].sort((a, b) => (a.slide ?? 0) - (b.slide ?? 0) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
