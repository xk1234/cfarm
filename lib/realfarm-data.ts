import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import realfarmData from "../data/realfarm.json"

type LocalAssetKind = "audio" | "video" | "text"

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
  status: string
  account: string
  handle: string
  times: string[]
  favorite: boolean
  theme: string
}

export type EditorSlide = {
  id: string
  kind: string
  text: string
  duration: string
  aspectRatio: string
}

type RealFarmJson = Omit<typeof realfarmData, "projects" | "automations" | "editor"> & {
  projects: Project[]
  automations: Automation[]
  editor: Omit<typeof realfarmData.editor, "slides"> & {
    slides: EditorSlide[]
  }
}

export type RealFarmData = RealFarmJson & {
  assets: {
    music: LocalAsset[]
    ugcAvatarVideos: LocalAsset[]
    greenscreenMemes: LocalAsset[]
    ctas: LocalAsset[]
  }
}
export type Video = RealFarmData["videos"][number]
export type ImageCollection = RealFarmData["imageCollections"][number]

export function loadRealFarmData(): RealFarmData {
  const data = realfarmData as RealFarmJson

  return {
    ...data,
    assets: {
      music: listLocalAssets("music", ["mp3", "wav"], "audio"),
      ugcAvatarVideos: listLocalAssets("ugc_avatar_videos", ["mp4", "webm", "mov"], "video"),
      greenscreenMemes: listLocalAssets("greenscreen_memes", ["mp4", "webm", "mov"], "video"),
      ctas: listLocalAssets("ctas", ["txt"], "text"),
    },
  }
}

function listLocalAssets(folder: string, extensions: string[], kind: LocalAssetKind): LocalAsset[] {
  const root = path.join(process.cwd(), "data", folder)
  const allowed = new Set(extensions.map((extension) => `.${extension.toLowerCase()}`))

  try {
    return collectFiles(root)
      .filter((filePath) => allowed.has(path.extname(filePath).toLowerCase()))
      .map((filePath) => {
        const relativePath = path.relative(path.join(process.cwd(), "data"), filePath)
        const name = titleFromFilename(filePath)

        return {
          id: slugify(relativePath),
          name,
          path: relativePath,
          url: `/api/local-assets/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`,
          kind,
          text: kind === "text" ? readFileSync(filePath, "utf8").trim() : undefined,
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
