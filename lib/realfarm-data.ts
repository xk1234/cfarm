import { unstable_cache } from "next/cache"

import {
  listMediaLibraryAssets,
  type MediaLibraryAsset,
} from "@/lib/media-library"
import type { MediaKind } from "@/lib/media-kind"

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

export type { Automation } from "@/lib/automation-base-contract"

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

const listCachedMediaLibraryAssets = unstable_cache(
  listMediaLibraryAssets,
  ["media-library-assets"],
  { revalidate: 300 }
)

export async function loadRealFarmData(
  options: LoadRealFarmDataOptions = {}
): Promise<RealFarmData> {
  const mediaAssets =
    options.mediaAssets ?? (await listCachedMediaLibraryAssets())

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
