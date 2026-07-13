import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import realfarmData from "../data/realfarm.json"
import demoSeedData from "../data/seeds/demo-realfarm.json"

import type {
  AutomationLifecycleStatus,
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
  automationKind?: "slideshow" | "video"
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

type GeneratedAssets = Record<string, unknown> & {
  higgsfieldCharacter?: {
    name: string
    model: string
    type: string
    url: string
  }
}

type RealFarmJson = Omit<
  typeof realfarmData,
  "projects" | "automations" | "generatedAssets" | "imageCollections"
> & {
  projects: Project[]
  automations: Automation[]
  generatedAssets: GeneratedAssets
  imageCollections: ImageCollectionSummary[]
}

type RealFarmDemoSeed = {
  generatedAssets?: RealFarmJson["generatedAssets"]
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
}

export function loadRealFarmData(
  options: LoadRealFarmDataOptions = {}
): RealFarmData {
  const data = realfarmData as RealFarmJson
  const demoSeed = demoSeedData as RealFarmDemoSeed
  const seededData = options.includeDemoSeed
    ? {
        ...data,
        generatedAssets: {
          ...data.generatedAssets,
          ...(demoSeed.generatedAssets ?? {}),
        },
        imageCollections: [
          ...data.imageCollections,
          ...(demoSeed.imageCollections ?? []),
        ],
      }
    : data

  return {
    ...seededData,
    assets: {
      music: listLocalAssets("music", ["mp3", "wav"], "audio"),
      ugcAvatarVideos: listLocalAssets(
        "ugc_avatar_videos",
        ["mp4", "webm", "mov"],
        "video"
      ),
      demoVideos: listLocalAssets(
        "assets/demos",
        ["mp4", "webm", "mov"],
        "video"
      ),
      greenscreenMemes: listLocalAssets(
        "greenscreen_memes",
        ["mp4", "webm", "mov"],
        "video"
      ),
      ctas: listLocalAssets("ctas", ["txt"], "text"),
    },
  }
}

function listLocalAssets(
  folder: string,
  extensions: string[],
  kind: LocalAssetKind
): LocalAsset[] {
  const root = path.join(process.cwd(), "data", folder)
  const allowed = new Set(
    extensions.map((extension) => `.${extension.toLowerCase()}`)
  )

  try {
    return collectFiles(root)
      .filter((filePath) => allowed.has(path.extname(filePath).toLowerCase()))
      .map((filePath) => {
        const relativePath = path.relative(
          path.join(process.cwd(), "data"),
          filePath
        )
        const name = titleFromFilename(filePath)

        return {
          id: slugify(relativePath),
          name,
          path: relativePath,
          url: `/api/local-assets/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`,
          kind,
          text:
            kind === "text" ? readFileSync(filePath, "utf8").trim() : undefined,
        }
      })
  } catch {
    return []
  }
}

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
  })
}

function titleFromFilename(filePath: string) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/^copy of /i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
