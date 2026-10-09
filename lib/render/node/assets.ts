/**
 * Server AssetLoader: `{media}` from the workspace's repository blobs
 * (ownership-checked through the repositories, which only return rows/files
 * of `workspaceId`) and `{url}` through the SSRF-guarded fetcher.
 */
import type { Repositories, WorkspaceId } from "@/lib/data"

import { cachedAssetLoader, checkImageBytes } from "../assets"
import { AssetLoadError, type AssetLoader, type LoadedAsset } from "../engine"
import type { ResolvedImageSource } from "../spec"
import { fetchRemoteImage, type RemoteFetchOptions } from "./remote-fetch"

export type ServerAssetLoaderOptions = {
  repositories: Pick<Repositories, "media" | "blobs">
  workspaceId: WorkspaceId
  remote?: RemoteFetchOptions
  /** Override for remote URLs (tests). Defaults to `fetchRemoteImage`. */
  fetchUrl?: (url: string) => Promise<LoadedAsset>
}

export function createServerAssetLoader(options: ServerAssetLoaderOptions): AssetLoader {
  const { repositories, workspaceId } = options
  const fetchUrl = options.fetchUrl ?? ((url: string) => fetchRemoteImage(url, options.remote))
  return cachedAssetLoader({
    async load(source: ResolvedImageSource): Promise<LoadedAsset> {
      if ("url" in source) return fetchUrl(source.url)
      const media = await repositories.media.get(workspaceId, source.media)
      if (!media || media.deletedAt) throw new AssetLoadError("asset.fetch_failed", `Media "${source.media}" was not found.`)
      if (media.kind !== "image") throw new AssetLoadError("asset.unsupported_type", `Media "${source.media}" is not an image.`)
      const blob = await repositories.blobs.get(workspaceId, media.bucketId, media.fileId)
      if (!blob) throw new AssetLoadError("asset.fetch_failed", `The file for media "${source.media}" is missing.`)
      const mime = checkImageBytes(blob.bytes, `Media "${source.media}"`)
      return { bytes: blob.bytes, mime }
    },
  })
}
