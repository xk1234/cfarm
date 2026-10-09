/**
 * Uploads library: `media` rows with no collection, files in the private
 * `media` bucket. `AssetRecord` is the wire shape the collections UI and MCP
 * tools use; it is a view over the row.
 */
import path from "node:path"

import { clean } from "@/lib/guards"
import { getRepositories, type Media, type Repositories, type WorkspaceId } from "@/lib/data"
import { ingestMedia, mediaFileIdFromUrl, mediaFileUrl } from "@/lib/files/ingest"
import type { MediaKind } from "@/lib/media-kind"

export type AssetKind = MediaKind
export type AssetSource = "upload"
export type AssetStatus = "ready"
export type AssetScope = "ugc_ad" | "ugc_demo" | "greenscreen" | "global"
export type AssetCategory = "outfit" | "accessory" | "background" | "product" | "reference" | "sound" | "other"

export const assetKinds: AssetKind[] = ["image", "video", "audio", "text"]
export const assetScopes: AssetScope[] = ["ugc_ad", "ugc_demo", "greenscreen", "global"]
export const assetCategories: AssetCategory[] = [
  "outfit",
  "accessory",
  "background",
  "product",
  "reference",
  "sound",
  "other",
]

export type AssetRecord = {
  id: string
  kind: AssetKind
  source: AssetSource
  status: AssetStatus
  scope: AssetScope
  category?: AssetCategory
  name: string
  caption: string
  mimeType?: string
  fileName?: string
  fileUrl?: string
  thumbnailUrl?: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export type AssetListFilters = {
  scope?: AssetScope
  category?: AssetCategory
  kind?: AssetKind
}

function toAssetRecord(media: Media): AssetRecord {
  const url = mediaFileUrl(media)
  return {
    id: media.id,
    kind: media.kind,
    source: "upload",
    status: "ready",
    scope: "global",
    name: media.name ?? "Untitled asset",
    caption: media.caption ?? "",
    mimeType: media.mimeType,
    fileName: media.name ?? undefined,
    fileUrl: url,
    thumbnailUrl: media.kind === "image" ? url : undefined,
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
    createdAt: media.createdAt,
    updatedAt: media.createdAt,
  }
}

async function uploadsLibrary(repos: Repositories, workspaceId: WorkspaceId, kind?: "image" | "video") {
  const out: Media[] = []
  let cursor: string | null = null
  do {
    const page = await repos.media.list(workspaceId, { collectionId: null, kind, limit: 100, cursor })
    out.push(...page.items)
    cursor = page.nextCursor
  } while (cursor && out.length < 2_000)
  return out
}

export async function listAssetRecords(
  workspaceId: WorkspaceId,
  filters: AssetListFilters = {},
  options: { repos?: Repositories } = {}
): Promise<AssetRecord[]> {
  // Only global, uncategorised image/video uploads exist after the refactor.
  if ((filters.scope && filters.scope !== "global") || filters.category) return []
  if (filters.kind === "audio" || filters.kind === "text") return []
  const repos = options.repos ?? getRepositories()
  return (await uploadsLibrary(repos, workspaceId, filters.kind)).map(toAssetRecord)
}

export async function createUploadedAssetRecord(
  workspaceId: WorkspaceId,
  input: {
    fileName: string
    mimeType?: string
    bytes: Uint8Array
    name?: string
    createdBy?: string
  },
  options: { repos?: Repositories } = {}
): Promise<AssetRecord> {
  const repos = options.repos ?? getRepositories()
  const extension = path.extname(input.fileName)
  const name = clean(input.name) || path.basename(input.fileName, extension) || "Untitled asset"
  const { value } = await ingestMedia(repos, workspaceId, {
    bytes: input.bytes,
    mime: clean(input.mimeType) || mimeTypeForExtension(extension.toLowerCase()),
    source: "upload",
    collectionId: null,
    name,
    createdBy: input.createdBy ?? workspaceId,
  })
  return toAssetRecord(value)
}

/** Soft-deletes uploads-library items whose file URL is listed (and not kept). */
export async function deleteAssetRecordsForUrls(
  workspaceId: WorkspaceId,
  input: { urls: string[]; keepUrls?: string[] },
  options: { repos?: Repositories } = {}
) {
  const repos = options.repos ?? getRepositories()
  const fileIds = new Set(input.urls.map((url) => mediaFileIdFromUrl(clean(url))).filter((id): id is string => !!id))
  for (const url of input.keepUrls ?? []) {
    const id = mediaFileIdFromUrl(clean(url))
    if (id) fileIds.delete(id)
  }
  if (fileIds.size === 0) return { deleted: 0, deletedFiles: 0 }
  let deleted = 0
  for (const media of await uploadsLibrary(repos, workspaceId)) {
    if (!fileIds.has(media.fileId)) continue
    await repos.media.softDelete(workspaceId, media.id)
    deleted += 1
  }
  return { deleted, deletedFiles: 0 }
}

export function parseAssetKind(value: unknown) {
  return enumValue<AssetKind>(value, assetKinds)
}

export function parseAssetScope(value: unknown) {
  return enumValue<AssetScope>(value, assetScopes)
}

export function parseAssetCategory(value: unknown) {
  return enumValue<AssetCategory>(value, assetCategories)
}

function enumValue<T extends string>(value: unknown, allowed: T[]) {
  const text = clean(value)
  return text && allowed.includes(text as T) ? (text as T) : undefined
}

function mimeTypeForExtension(extension: string) {
  switch (extension) {
    case ".avif":
      return "image/avif"
    case ".gif":
      return "image/gif"
    case ".jpeg":
    case ".jpg":
      return "image/jpeg"
    case ".png":
      return "image/png"
    case ".webp":
      return "image/webp"
    case ".heic":
      return "image/heic"
    case ".mov":
      return "video/quicktime"
    case ".mp4":
      return "video/mp4"
    case ".webm":
      return "video/webm"
    default:
      return "application/octet-stream"
  }
}
