import realfarmData from "../data/realfarm.json"
import demoSeedData from "../data/seeds/demo-realfarm.json"
import { unstable_cache } from "next/cache"

import {
  listMediaLibraryAssets,
  type MediaLibraryAsset,
} from "@/lib/media-library"
import type {
  AutomationLifecycleStatus,
  AutomationPostingMode,
  AutomationSchedule,
} from "@/lib/realfarm-automation"
import type { MediaKind } from "@/lib/media-kind"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"

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

export type Project = {
  id: string
  title: string
  status: string
  age: string
  slides: string[]
}

export type Automation = {
  id: string
  name: string
  automationKind?: "slideshow" | "video" | "x_threads"
  postingMode?: AutomationPostingMode
  generationLeadMinutes?: number
  platform?: "x" | "threads"
  status: AutomationLifecycleStatus
  account: string
  handle: string
  times: string[]
  timezone?: string
  schedule?: AutomationSchedule
  favorite: boolean
  theme: string
  socialIntegrations: PostFastSocialIntegration[]
  created_at?: string
}

export type ImageCollectionSummary = {
  id: string
  title: string
  imageCount: number
  withoutCaptions: number
  theme: string
}

type RealFarmJson = Omit<
  typeof realfarmData,
  "projects" | "automations" | "imageCollections"
> & {
  projects: Project[]
  automations: Automation[]
  imageCollections: ImageCollectionSummary[]
}

type RealFarmDemoSeed = {
  imageCollections?: RealFarmJson["imageCollections"]
}

export type RealFarmData = RealFarmJson & {
  assets: {
    music: LocalAsset[]
    ugcAvatarVideos: LocalAsset[]
    demoVideos: LocalAsset[]
    greenscreenMemes: LocalAsset[]
    ctas: LocalAsset[]
  }
}
export type Video = RealFarmData["videos"][number]
export type ImageCollection = RealFarmData["imageCollections"][number]

export type LoadRealFarmDataOptions = {
  includeDemoSeed?: boolean
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
  const data = realfarmData as RealFarmJson
  const demoSeed = demoSeedData as RealFarmDemoSeed
  const mediaAssets =
    options.mediaAssets ?? (await listCachedMediaLibraryAssets())
  const seededData = options.includeDemoSeed
    ? {
        ...data,
        imageCollections: [
          ...data.imageCollections,
          ...(demoSeed.imageCollections ?? []),
        ],
      }
    : data

  return {
    ...seededData,
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
