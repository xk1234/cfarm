import type { MediaKind } from "@/lib/media-kind"

/**
 * Bundled audio/video/text assets (music, avatar videos, greenscreen memes,
 * CTAs) belonged to the removed video workflows and have no store after the
 * Appwrite refactor; callers may still pass them in explicitly.
 */
export type MediaLibraryAsset = {
  id: string
  name: string
  path: string
  url: string
  kind: "audio" | "video" | "text"
  collection: "music" | "ugc_avatar_videos" | "demo_videos" | "greenscreen_memes" | "ctas"
  text?: string
}

// Bundled local assets are never images; derive from the canonical MediaKind.
type LocalAssetKind = Exclude<MediaKind, "image">

export type LocalAsset = {
  id: string
  name: string
  path: string
  url: string
  kind: LocalAssetKind
  text?: string
}

interface RealFarmJson {
  brand: {
    name: "LumenClip"
    owner?: string
  }
}

const BRAND = {
  name: "LumenClip",
} as const satisfies RealFarmJson["brand"]

export type RealFarmData = RealFarmJson & {
  assets: {
    music: LocalAsset[]
    ugcAvatarVideos: LocalAsset[]
    demoVideos: LocalAsset[]
    greenscreenMemes: LocalAsset[]
    ctas: LocalAsset[]
  }
}

export type LoadRealFarmDataOptions = {
  mediaAssets?: MediaLibraryAsset[]
}

export async function loadRealFarmData(
  options: LoadRealFarmDataOptions = {}
): Promise<RealFarmData> {
  const mediaAssets = options.mediaAssets ?? []

  return {
    brand: BRAND,
    assets: {
      music: assetsFor(mediaAssets, "music"),
      ugcAvatarVideos: assetsFor(mediaAssets, "ugc_avatar_videos"),
      demoVideos: assetsFor(mediaAssets, "demo_videos"),
      greenscreenMemes: assetsFor(mediaAssets, "greenscreen_memes"),
      ctas: assetsFor(mediaAssets, "ctas"),
    },
  }
}

function assetsFor(
  assets: MediaLibraryAsset[],
  collection: MediaLibraryAsset["collection"]
): LocalAsset[] {
  return assets
    .filter((asset) => asset.collection === collection)
    .map(({ id, name, path, url, kind, text }) => ({
      id,
      name,
      path,
      url,
      kind,
      text,
    }))
}
