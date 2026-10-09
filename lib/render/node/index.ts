/**
 * Server entry for the render engine (API routes, worker, MCP).
 *
 * `renderSpec` from `@/lib/render/engine` already loads the node platform on
 * first use; this module adds the server-only pieces: repository/remote asset
 * loading with the SSRF guard, ZIP output and eager font setup.
 */
export { renderSpec, ENGINE_VERSION } from "../engine"
export { zipRenderedSlides, exportSlug, slideFileName } from "../output/zip"
export { createServerAssetLoader, type ServerAssetLoaderOptions } from "./assets"
export { fetchRemoteImage, isBlockedAddress, type RemoteFetchOptions } from "./remote-fetch"
export { prepareNodeRenderer } from "./platform"
export { bundledFontDir } from "./fonts"
