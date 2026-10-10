/**
 * Server entry for the render engine (API routes, worker, MCP).
 *
 * `renderSpec` from `@/lib/render/engine` already loads the node platform on
 * first use; this module adds the server-only pieces: repository/remote asset
 * loading with the SSRF guard, ZIP output and eager font setup.
 */
export { renderSpec, ENGINE_VERSION } from "../engine"
export { zipRenderedSlides, exportSlug, slideFileName } from "../output/zip"
// One server asset loader + SSRF-guarded fetch for every caller; it lives with the render service.
export {
  createServerAssetLoader,
  fetchRemoteImage,
  type RemoteFetchOptions,
  type ServerAssetLoaderOptions,
} from "@/lib/renders/assets"
export { isBlockedAddress } from "@/lib/url-guard"
export { prepareNodeRenderer } from "./platform"
export { bundledFontDir } from "./fonts"
