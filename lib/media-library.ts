import path from "node:path"
import { createHash } from "node:crypto"

import { clean } from "@/lib/guards"
import { readJsonArrayStore, upsertJsonArrayRecord } from "@/lib/json-store"

export type MediaLibraryAsset = {
  id: string
  name: string
  path: string
  url: string
  kind: "audio" | "video" | "text"
  collection:
    "music" | "ugc_avatar_videos" | "demo_videos" | "greenscreen_memes" | "ctas"
  text?: string
}

const rootDir = path.join(process.cwd(), "data", "media-library")
const fileName = "assets.json"

export async function listMediaLibraryAssets(): Promise<MediaLibraryAsset[]> {
  return readJsonArrayStore({
    rootDir,
    fileName,
    key: "assets",
    normalize: normalizeMediaLibraryAsset,
  })
}

export async function upsertMediaLibraryAsset(asset: MediaLibraryAsset) {
  const normalized = normalizeMediaLibraryAsset(asset)
  if (!normalized) {
    throw new Error("Invalid media-library asset")
  }
  await upsertJsonArrayRecord({
    rootDir,
    fileName,
    key: "assets",
    record: normalized,
  })
  return normalized
}

export function mediaLibraryAsset(input: {
  relativePath: string
  kind: MediaLibraryAsset["kind"]
  collection: MediaLibraryAsset["collection"]
  text?: string
}): MediaLibraryAsset {
  const relativePath = input.relativePath.split(path.sep).join("/")
  return {
    id: `${slugify(relativePath)}-${shortHash(relativePath)}`,
    name: titleFromFilename(relativePath),
    path: relativePath,
    url: `/api/local-assets/${relativePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    kind: input.kind,
    collection: input.collection,
    text: clean(input.text) || undefined,
  }
}

function normalizeMediaLibraryAsset(
  asset: MediaLibraryAsset
): MediaLibraryAsset | null {
  const id = clean(asset?.id)
  const relativePath = clean(asset?.path).replaceAll("\\", "/")
  const url = clean(asset?.url)
  const name = clean(asset?.name)
  if (!id || !relativePath || !url || !name) return null
  if (!url.startsWith("/api/local-assets/")) return null
  if (!isKind(asset.kind) || !isCollection(asset.collection)) return null
  return {
    id,
    name,
    path: relativePath,
    url,
    kind: asset.kind,
    collection: asset.collection,
    text: clean(asset.text) || undefined,
  }
}

function isKind(value: unknown): value is MediaLibraryAsset["kind"] {
  return value === "audio" || value === "video" || value === "text"
}

function isCollection(
  value: unknown
): value is MediaLibraryAsset["collection"] {
  return (
    value === "music" ||
    value === "ugc_avatar_videos" ||
    value === "demo_videos" ||
    value === "greenscreen_memes" ||
    value === "ctas"
  )
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

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8)
}
