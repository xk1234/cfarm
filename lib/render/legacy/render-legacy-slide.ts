/**
 * Server-side render of one legacy slideshow slide through the spec engine
 * (replaces the old slideshow-raster-renderer). PNG only; SVG output is gone.
 */
import { createMemoryAssetLoader } from "../assets"
import type { LoadedAsset } from "../engine"
import { renderSpec } from "../engine"
import { resolveTemplate } from "../spec"
import {
  LEGACY_OVERLAY_MEDIA,
  LEGACY_SOURCE_MEDIA,
  legacyIconMedia,
  legacySlideSpec,
  type LegacySlideshowSettings,
} from "./from-slideshow-record"
import type { SlideshowSlide } from "./slideshow-record"

export async function renderLegacySlidePng(input: {
  slide: SlideshowSlide
  settings?: LegacySlideshowSettings
  source: Uint8Array
  overlay?: Uint8Array
  icons?: Uint8Array[]
}): Promise<Uint8Array> {
  const icons = input.icons ?? []
  const spec = legacySlideSpec({
    slide: input.slide,
    settings: input.settings,
    hasOverlay: !!input.overlay,
    iconCount: icons.length,
  })
  const entries = new Map<string, LoadedAsset>([[`media:${LEGACY_SOURCE_MEDIA}`, { bytes: input.source, mime: "" }]])
  if (input.overlay) entries.set(`media:${LEGACY_OVERLAY_MEDIA}`, { bytes: input.overlay, mime: "" })
  icons.forEach((bytes, i) => entries.set(`media:${legacyIconMedia(i)}`, { bytes, mime: "" }))
  const resolved = await resolveTemplate(spec, {})
  const result = await renderSpec(resolved, { format: "png", scale: 1, assets: createMemoryAssetLoader(entries) })
  return result.slides[0].bytes
}
