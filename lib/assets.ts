import { clean } from "@/lib/guards"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

export type AssetKind = "image" | "video" | "audio" | "text"
export type AssetSource = "upload" | "ai_generated"
export type AssetStatus = "processing" | "ready" | "failed"
export type AssetScope =
  "ugc_avatar" | "ugc_ad" | "ugc_demo" | "greenscreen" | "global"
export type AssetCategory =
  | "outfit"
  | "accessory"
  | "background"
  | "product"
  | "reference"
  | "sound"
  | "other"

export const assetKinds: AssetKind[] = ["image", "video", "audio", "text"]
export const assetScopes: AssetScope[] = [
  "ugc_avatar",
  "ugc_ad",
  "ugc_demo",
  "greenscreen",
  "global",
]
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
  prompt?: string
  model?: string
  mimeType?: string
  fileName?: string
  fileUrl?: string
  thumbnailUrl?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
  error?: string
}

export type AssetListFilters = {
  rootDir?: string
  scope?: AssetScope
  category?: AssetCategory
  kind?: AssetKind
}

const defaultAssetRoot = path.join(process.cwd(), "data", "assets")
const assetDbFileName = "assets.json"
const assetFilesFolder = "files"
const demoAssetFilesFolder = "demos"

const extensionKindMap: Record<string, AssetKind> = {
  ".avif": "image",
  ".gif": "image",
  ".jpeg": "image",
  ".jpg": "image",
  ".png": "image",
  ".svg": "image",
  ".webp": "image",
  ".m4a": "audio",
  ".mp3": "audio",
  ".ogg": "audio",
  ".wav": "audio",
  ".mkv": "video",
  ".mov": "video",
  ".mp4": "video",
  ".webm": "video",
  ".txt": "text",
}

export async function listAssetRecords(filters: AssetListFilters = {}) {
  const records = await readAssetRecords(filters.rootDir)
  return records.filter(
    (record) =>
      (!filters.scope || record.scope === filters.scope) &&
      (!filters.category || record.category === filters.category) &&
      (!filters.kind || record.kind === filters.kind)
  )
}

export async function createUploadedAssetRecord(input: {
  rootDir?: string
  fileName: string
  mimeType?: string
  bytes: Buffer
  scope: AssetScope
  category?: AssetCategory
  name?: string
  metadata?: Record<string, unknown>
}) {
  const now = new Date().toISOString()
  const rootDir = input.rootDir ?? defaultAssetRoot
  const extension = extensionForFile(input.fileName)
  const kind = kindFromExtension(extension)
  const id = randomUUID()
  const name =
    clean(input.name) ||
    path.basename(input.fileName, extension) ||
    "Untitled asset"
  const safeFileName = `${Date.now()}-${id}${extension || ".bin"}`
  const filesFolder = uploadedAssetFolder(input.scope)

  await mkdir(path.join(rootDir, filesFolder), { recursive: true })
  await writeFile(path.join(rootDir, filesFolder, safeFileName), input.bytes)

  const record: AssetRecord = {
    id,
    kind,
    source: "upload",
    status: "ready",
    scope: input.scope,
    category: input.category,
    name,
    caption: captionForAsset({ kind, name, source: "upload" }),
    mimeType: input.mimeType || mimeTypeForExtension(extension),
    fileName: safeFileName,
    fileUrl: publicAssetUrl(safeFileName, filesFolder),
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata,
  }

  await prependAssetRecord(rootDir, record)
  return record
}

export async function createGeneratedAssetRecord(input: {
  rootDir?: string
  kind: AssetKind
  scope: AssetScope
  category?: AssetCategory
  name?: string
  prompt: string
  model: string
}) {
  const now = new Date().toISOString()
  const rootDir = input.rootDir ?? defaultAssetRoot
  const id = randomUUID()
  const name =
    clean(input.name) || clean(input.prompt).slice(0, 60) || "Generated asset"
  const prompt = clean(input.prompt)
  const model = clean(input.model) || "Unknown model"
  const fileName =
    input.kind === "image" ? `${Date.now()}-${id}.svg` : undefined
  const fileUrl = fileName ? publicAssetUrl(fileName) : undefined
  const status: AssetStatus = input.kind === "image" ? "ready" : "failed"
  const error =
    input.kind === "image"
      ? undefined
      : "AI generation for this asset type is not wired yet"

  if (fileName) {
    await mkdir(path.join(rootDir, assetFilesFolder), { recursive: true })
    await writeFile(
      path.join(rootDir, assetFilesFolder, fileName),
      generatedSvg({ name, prompt, model })
    )
  }

  const record: AssetRecord = {
    id,
    kind: input.kind,
    source: "ai_generated",
    status,
    scope: input.scope,
    category: input.category,
    name,
    caption:
      status === "ready"
        ? captionForAsset({
            kind: input.kind,
            name,
            source: "ai_generated",
            prompt,
          })
        : "",
    prompt,
    model,
    mimeType: fileName ? "image/svg+xml" : undefined,
    fileName,
    fileUrl,
    createdAt: now,
    updatedAt: now,
    error,
  }

  await prependAssetRecord(rootDir, record)
  return record
}

export async function updateAssetCaption(input: {
  rootDir?: string
  id: string
  caption: string
}) {
  const rootDir = input.rootDir ?? defaultAssetRoot
  const records = await readAssetRecords(rootDir)
  const updatedAt = new Date().toISOString()
  const next = records.map((record) =>
    record.id === input.id
      ? { ...record, caption: clean(input.caption), updatedAt }
      : record
  )
  await writeAssetRecords(rootDir, next)
  return next.find((record) => record.id === input.id) ?? null
}

export async function deleteAssetRecordsForUrls(input: {
  rootDir?: string
  urls: string[]
  keepUrls?: string[]
}) {
  const rootDir = input.rootDir ?? defaultAssetRoot
  const urls = new Set(input.urls.map(clean).filter(Boolean))
  const keepUrls = new Set(input.keepUrls?.map(clean).filter(Boolean) ?? [])
  if (urls.size === 0) {
    return { deleted: 0, deletedFiles: 0 }
  }

  const records = await readAssetRecords(rootDir)
  const deletedRecords = records.filter((record) => {
    const recordUrls = [record.fileUrl, record.thumbnailUrl]
      .map(clean)
      .filter(Boolean)
    return recordUrls.some((url) => urls.has(url) && !keepUrls.has(url))
  })
  const nextRecords = records.filter(
    (record) => !deletedRecords.some((deleted) => deleted.id === record.id)
  )

  await writeAssetRecords(rootDir, nextRecords)
  const remainingUrls = new Set(
    nextRecords.flatMap((record) =>
      [record.fileUrl, record.thumbnailUrl].map(clean).filter(Boolean)
    )
  )
  const deletedFiles = await deleteUnusedAssetFiles(
    rootDir,
    deletedRecords,
    remainingUrls
  )

  return {
    deleted: deletedRecords.length,
    deletedFiles,
  }
}

async function prependAssetRecord(rootDir: string, record: AssetRecord) {
  const records = await readAssetRecords(rootDir)
  await writeAssetRecords(rootDir, [
    record,
    ...records.filter((item) => item.id !== record.id),
  ])
}

async function readAssetRecords(
  rootDir = defaultAssetRoot
): Promise<AssetRecord[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: assetDbFileName,
    key: "assets",
    normalize: normalizeAssetRecord,
  })
}

async function writeAssetRecords(rootDir: string, records: AssetRecord[]) {
  await writeJsonArrayStore({
    rootDir,
    fileName: assetDbFileName,
    key: "assets",
    records,
  })
}

async function deleteUnusedAssetFiles(
  rootDir: string,
  deletedRecords: AssetRecord[],
  remainingUrls: Set<string>
) {
  const filePaths = new Map<string, string>()

  for (const record of deletedRecords) {
    for (const url of [record.fileUrl, record.thumbnailUrl]
      .map(clean)
      .filter(Boolean)) {
      if (remainingUrls.has(url)) {
        continue
      }
      const filePath = localAssetFilePath(rootDir, url)
      if (filePath) {
        filePaths.set(filePath, url)
      }
    }
  }

  for (const filePath of filePaths.keys()) {
    await rm(filePath, { force: true })
  }

  return filePaths.size
}

function localAssetFilePath(rootDir: string, assetUrl: string) {
  const prefix = "/api/local-assets/assets/"
  if (!assetUrl.startsWith(prefix)) {
    return null
  }

  const encodedRelativePath = assetUrl.slice(prefix.length).split(/[?#]/)[0]
  let relativePath = ""
  try {
    relativePath = encodedRelativePath
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join(path.sep)
  } catch {
    return null
  }

  if (!relativePath || path.isAbsolute(relativePath)) {
    return null
  }

  const root = path.resolve(rootDir)
  const filePath = path.resolve(root, relativePath)
  return filePath.startsWith(`${root}${path.sep}`) ? filePath : null
}

function normalizeAssetRecord(record: AssetRecord): AssetRecord | null {
  if (
    !record?.id ||
    !record.scope ||
    !record.kind ||
    !record.source ||
    !record.status
  ) {
    return null
  }
  return {
    ...record,
    name: clean(record.name) || "Untitled asset",
    caption: clean(record.caption),
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    updatedAt:
      clean(record.updatedAt) ||
      clean(record.createdAt) ||
      new Date().toISOString(),
    metadata: sanitizeAssetMetadata(record.metadata, record.fileUrl),
  }
}

function sanitizeAssetMetadata(
  metadata: unknown,
  fileUrl: unknown
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined
  }

  const localFileUrl = localAppUrl(fileUrl)
  const next = { ...metadata } as Record<string, unknown>
  for (const key of ["sourceUrl", "redditPermalink", "fluxResultUrl"]) {
    if (isRemoteUrl(next[key])) {
      delete next[key]
    }
  }
  for (const key of ["sourceImageUrl", "originalImageUrl"]) {
    if (isRemoteUrl(next[key])) {
      if (localFileUrl) {
        next[key] = localFileUrl
      } else {
        delete next[key]
      }
    }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function isRemoteUrl(value: unknown) {
  return /^https?:\/\//i.test(clean(value))
}

function localAppUrl(value: unknown) {
  const url = clean(value)
  return url.startsWith("/") && !url.startsWith("//") ? url : ""
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

function extensionForFile(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  return extensionKindMap[extension] ? extension : ""
}

function kindFromExtension(extension: string): AssetKind {
  return extensionKindMap[extension] ?? "text"
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
    case ".svg":
      return "image/svg+xml"
    case ".webp":
      return "image/webp"
    case ".m4a":
      return "audio/mp4"
    case ".mp3":
      return "audio/mpeg"
    case ".ogg":
      return "audio/ogg"
    case ".wav":
      return "audio/wav"
    case ".mkv":
      return "video/x-matroska"
    case ".mov":
      return "video/quicktime"
    case ".mp4":
      return "video/mp4"
    case ".webm":
      return "video/webm"
    case ".txt":
      return "text/plain"
    default:
      return "application/octet-stream"
  }
}

function uploadedAssetFolder(scope: AssetScope) {
  return scope === "ugc_demo" ? demoAssetFilesFolder : assetFilesFolder
}

function publicAssetUrl(fileName: string, folder = assetFilesFolder) {
  return `/api/local-assets/assets/${folder}/${encodeURIComponent(fileName)}`
}

function captionForAsset(input: {
  kind: AssetKind
  name: string
  source: AssetSource
  prompt?: string
}) {
  if (input.source === "ai_generated") {
    return `AI-generated ${input.kind} asset from prompt: ${clean(input.prompt) || input.name}.`
  }
  return `Uploaded ${input.kind} asset: ${input.name}.`
}

function generatedSvg(input: { name: string; prompt: string; model: string }) {
  const title = escapeXml(input.name)
  const prompt = escapeXml(input.prompt || input.name)
  const model = escapeXml(input.model)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f5f1e8"/>
      <stop offset="1" stop-color="#d7e4f2"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect x="96" y="112" width="832" height="800" rx="42" fill="#ffffff" opacity="0.82"/>
  <text x="512" y="430" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#1f2937">${title}</text>
  <text x="512" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#4b5563">${model}</text>
  <foreignObject x="180" y="570" width="664" height="180">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font: 30px Arial, sans-serif; color: #374151; text-align: center; line-height: 1.35;">${prompt}</div>
  </foreignObject>
</svg>
`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

