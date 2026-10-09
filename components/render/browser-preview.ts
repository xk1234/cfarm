"use client"

/**
 * Browser preview: resolves a template + slot values and paints it with the
 * same `lib/render` engine the server uses (`renderSpec`). Fonts are loaded
 * from the bundled registry through `FontFace`; images come from the
 * ownership-checked file route, the SSRF-guarded image proxy, or locally
 * painted placeholders for empty slots. Server PNGs remain authoritative.
 */
import type { AssetLoader, FontFaceInfo, LoadedAsset } from "@/lib/render/engine"
import type {
  ResolvedImageSource,
  ResolvedSpec,
  SlideshowSpec,
  SlotValues,
} from "@/lib/render/spec"

import {
  apiRoutes,
  listCollectionMediaIds,
  mediaSourceUrl,
} from "@/components/realfarm/api-client"

import {
  placeholderLabelFromUrl,
  previewSlotValues,
  withoutCollectionSources,
} from "./slot-values"

export type PreviewSlide = {
  index: number
  id: string
  url: string
  width: number
  height: number
}

export type PreviewResult = {
  slides: PreviewSlide[]
  warnings: { code: string; message: string; slide?: number }[]
}

/** The engine is not available in the browser yet (stub or missing canvas). */
export class PreviewUnavailableError extends Error {
  constructor(message = "Live preview is not available yet.") {
    super(message)
    this.name = "PreviewUnavailableError"
  }
}

const loadedFontFiles = new Set<string>()

async function ensureFonts(resolved: ResolvedSpec, registry: readonly FontFaceInfo[]) {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return
  const families = new Set(resolved.fonts.map((font) => font.family))
  const faces = registry.filter((face) => families.has(face.family))
  await Promise.all(
    faces.map(async (face) => {
      if (loadedFontFiles.has(face.file)) return
      loadedFontFiles.add(face.file)
      try {
        const weight =
          face.weights.length > 1
            ? `${Math.min(...face.weights)} ${Math.max(...face.weights)}`
            : String(face.weights[0] ?? 400)
        const fontFace = new FontFace(face.family, `url(${apiRoutes.fontFile(face.file)})`, {
          weight,
          style: face.style,
        })
        await fontFace.load()
        document.fonts.add(fontFace)
      } catch {
        loadedFontFiles.delete(face.file)
      }
    })
  )
}

async function placeholderAsset(label: string): Promise<LoadedAsset> {
  const width = 720
  const height = 960
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, "#d9d6e6")
    gradient.addColorStop(1, "#b9b5cb")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = "rgba(37,33,54,0.55)"
    ctx.font = "600 40px Inter, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(label.slice(0, 32), width / 2, height / 2)
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Could not paint the placeholder image")
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/png" }
}

async function fetchAsset(url: string): Promise<LoadedAsset> {
  const { AssetLoadError } = await import("@/lib/render/engine")
  const response = await fetch(url, { credentials: "same-origin" })
  if (!response.ok) {
    throw new AssetLoadError("asset.fetch_failed", `Image request failed (${response.status}).`)
  }
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? ""
  if (!mime.startsWith("image/")) {
    throw new AssetLoadError("asset.unsupported_type", "The source is not an image.")
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime }
}

export function createBrowserAssetLoader(): AssetLoader {
  const cache = new Map<string, Promise<LoadedAsset>>()
  return {
    load(source: ResolvedImageSource) {
      const key = "media" in source ? `media:${source.media}` : `url:${source.url}`
      let pending = cache.get(key)
      if (!pending) {
        if ("media" in source) pending = fetchAsset(mediaSourceUrl(source.media))
        else {
          const label = placeholderLabelFromUrl(source.url)
          pending =
            label !== null ? placeholderAsset(label) : fetchAsset(apiRoutes.imageProxy(source.url))
        }
        cache.set(key, pending)
      }
      return pending
    },
  }
}

/** Resolves a template with preview placeholders; collection picks use the real (seeded) collection. */
export async function resolveForPreview(
  spec: SlideshowSpec,
  slotValues: SlotValues,
  options: { seed?: string } = {}
): Promise<ResolvedSpec> {
  const { resolveTemplate, SpecError } = await import("@/lib/render/spec")
  const values = previewSlotValues(spec, slotValues)
  try {
    return await resolveTemplate(spec, values, {
      seed: options.seed,
      resolveCollection: async (collection) => {
        try {
          return await listCollectionMediaIds(collection)
        } catch {
          return null
        }
      },
    })
  } catch (error) {
    if (
      error instanceof SpecError &&
      error.errors.every((issue) => issue.code.startsWith("asset.collection") || issue.code === "asset.pick_out_of_range")
    ) {
      return resolveTemplate(spec, withoutCollectionSources(spec, values), { seed: options.seed })
    }
    throw error
  }
}

/**
 * Paints the requested slides (default all) as PNG blob URLs. The caller owns
 * the URLs and must pass them to `revokePreview` when done.
 */
export async function renderPreviewSlides(
  resolved: ResolvedSpec,
  options: { scale?: number; slides?: number[] } = {}
): Promise<PreviewResult> {
  if (typeof window === "undefined") throw new PreviewUnavailableError()
  const engine = await import("@/lib/render/engine")
  await ensureFonts(resolved, engine.listFonts())
  let result
  try {
    result = await engine.renderSpec(resolved, {
      format: "png",
      scale: options.scale ?? 0.5,
      slides: options.slides,
      assets: createBrowserAssetLoader(),
    })
  } catch (error) {
    if (error instanceof engine.NotImplementedError) throw new PreviewUnavailableError()
    throw error
  }
  return {
    slides: result.slides.map((slide) => ({
      index: slide.index,
      id: slide.id,
      width: slide.width,
      height: slide.height,
      url: URL.createObjectURL(
        new Blob([slide.bytes.slice().buffer as ArrayBuffer], { type: slide.mime })
      ),
    })),
    warnings: result.warnings,
  }
}

export function revokePreview(slides: readonly PreviewSlide[]) {
  for (const slide of slides) {
    if (slide.url.startsWith("blob:")) URL.revokeObjectURL(slide.url)
  }
}
