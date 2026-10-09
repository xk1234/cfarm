/**
 * Isomorphic asset helpers: content sniffing, limits, and in-memory loaders.
 * Server loaders (repository blobs + SSRF-guarded fetch) live in
 * `./node/assets`; the browser preview supplies its own loader.
 */
import { imageSourceKey } from "./display-list"
import { AssetLoadError, type AssetLoader, type LoadedAsset } from "./engine"
import type { ResolvedImageSource } from "./spec"

/** doc 01 §2.5: images over 25 MB or 50 MP fail with `asset.too_large`. */
export const ASSET_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 50_000_000,
} as const

export type SniffedImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "image/svg+xml" | "image/bmp"

/** Detects the image type from magic bytes (never trusts Content-Type). */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  const b = bytes
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x)
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg"
  if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return "image/gif"
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"
  if (b.length >= 12 && at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand === "avif" || brand === "avis") return "image/avif"
  }
  if (b.length >= 2 && at(0, 0x42, 0x4d)) return "image/bmp"
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, Math.min(b.length, 1024))).trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml"
  return null
}

/**
 * SVGs are rasterized by librsvg; reject documents that could pull in other
 * resources (external hrefs, entities, scripts) so an SVG can never read local
 * files or reach the network.
 */
export function assertSafeSvg(bytes: Uint8Array): void {
  const text = new TextDecoder().decode(bytes)
  if (/<!ENTITY|<script|<foreignObject/i.test(text)) {
    throw new AssetLoadError("asset.unsupported_type", "SVG images with entities, scripts or foreign objects are not supported.")
  }
  for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']|url\(\s*["']?([^"')]*)/gi)) {
    const ref = (m[1] ?? m[2] ?? "").trim()
    if (ref && !ref.startsWith("#") && !ref.startsWith("data:")) {
      throw new AssetLoadError("asset.unsupported_type", "SVG images may not reference external resources.")
    }
  }
}

/** Validates loaded bytes: size cap and a sniffable image type. Returns the sniffed MIME. */
export function checkImageBytes(bytes: Uint8Array, label: string): SniffedImageType {
  if (bytes.byteLength > ASSET_LIMITS.maxBytes) {
    throw new AssetLoadError("asset.too_large", `${label} is larger than ${ASSET_LIMITS.maxBytes / 1024 / 1024} MB.`)
  }
  const type = sniffImageType(bytes)
  if (!type) throw new AssetLoadError("asset.unsupported_type", `${label} is not a supported image (PNG, JPEG, GIF, WebP, AVIF, BMP or SVG).`)
  if (type === "image/svg+xml") assertSafeSvg(bytes)
  return type
}

/** An AssetLoader over in-memory bytes keyed by `imageSourceKey` (tests, previews, legacy staging). */
export function createMemoryAssetLoader(entries: ReadonlyMap<string, LoadedAsset> | Record<string, LoadedAsset>): AssetLoader {
  const map = entries instanceof Map ? entries : new Map(Object.entries(entries))
  return {
    async load(source: ResolvedImageSource): Promise<LoadedAsset> {
      const key = imageSourceKey(source)
      const hit = map.get(key)
      if (!hit) throw new AssetLoadError("asset.fetch_failed", `No image for ${key}.`)
      const mime = checkImageBytes(hit.bytes, key)
      return { bytes: hit.bytes, mime }
    },
  }
}

/** Wraps a loader so each distinct source is loaded once. */
export function cachedAssetLoader(loader: AssetLoader): AssetLoader {
  const cache = new Map<string, Promise<LoadedAsset>>()
  return {
    load(source) {
      const key = imageSourceKey(source)
      let p = cache.get(key)
      if (!p) {
        p = loader.load(source)
        cache.set(key, p)
      }
      return p
    },
  }
}
