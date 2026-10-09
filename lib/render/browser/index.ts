/**
 * Browser entry for the render engine (live preview). Importing this module
 * installs the browser platform, after which `renderSpec` from
 * `@/lib/render/engine` (or `renderPreview` here) runs in the page with the
 * same layout and painter as the server. Never import `@/lib/render/node`
 * from client code.
 */
import { imageSourceKey } from "../display-list"
import { AssetLoadError, renderSpec, type AssetLoader, type LoadedAsset, type RenderResult } from "../engine"
import { cachedAssetLoader } from "../assets"
import { setRenderPlatform } from "../platform"
import type { ResolvedImageSource, ResolvedSpec } from "../spec"
import { browserRenderPlatform, type BrowserPlatformOptions } from "./platform"

export { browserRenderPlatform, defaultFontUrl, bundledFontFiles } from "./platform"
export { zipRenderedSlides, exportSlug } from "../output/zip"

let installed = false

/** (Re)installs the browser platform, e.g. with a custom font URL. */
export function installBrowserRenderer(options: BrowserPlatformOptions = {}): void {
  setRenderPlatform(browserRenderPlatform(options))
  installed = true
}

if (typeof window !== "undefined" && !installed) installBrowserRenderer()

export type BrowserAssetLoaderOptions = {
  /** URL of an owned media file (an ownership-checked app route). */
  mediaUrl: (mediaId: string) => string
  /** Rewrites remote image URLs (e.g. through a server-side proxy); default fetches directly (CORS). */
  remoteUrl?: (url: string) => string
}

/** Fetches preview images through app routes with the viewer's session. */
export function createBrowserAssetLoader(options: BrowserAssetLoaderOptions): AssetLoader {
  return cachedAssetLoader({
    async load(source: ResolvedImageSource): Promise<LoadedAsset> {
      const href = "media" in source ? options.mediaUrl(source.media) : (options.remoteUrl ?? ((u) => u))(source.url)
      let response: Response
      try {
        response = await fetch(href, { credentials: "same-origin" })
      } catch (err) {
        throw new AssetLoadError("asset.fetch_failed", `Could not load ${imageSourceKey(source)}: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (!response.ok) throw new AssetLoadError("asset.fetch_failed", `Could not load ${imageSourceKey(source)} (HTTP ${response.status}).`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      return { bytes, mime: response.headers.get("content-type") ?? "application/octet-stream" }
    },
  })
}

export type PreviewOptions = {
  /** 0-based slide indexes; default all. */
  slides?: number[]
  /** Default 0.5 (half-resolution previews are fast and sharp enough on screen). */
  scale?: number
  assets?: AssetLoader
}

/** Renders preview PNGs in the browser. */
export function renderPreview(resolved: ResolvedSpec, options: PreviewOptions = {}): Promise<RenderResult> {
  if (!installed) installBrowserRenderer()
  return renderSpec(resolved, { format: "png", scale: options.scale ?? 0.5, slides: options.slides, assets: options.assets })
}

/** Object URLs for rendered slides (caller revokes them). */
export function slideObjectUrls(result: RenderResult): string[] {
  return result.slides.map((s) => URL.createObjectURL(new Blob([s.bytes as BlobPart], { type: s.mime })))
}
