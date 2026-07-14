import { clean, isRecord } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { deleteAssetRecordsForUrls } from "@/lib/assets"
import {
  generatedVideoTypeConfig,
  type GeneratedVideoCreatePayload,
  type GeneratedVideoExport,
  type GeneratedVideoStatus,
  type GeneratedVideoType,
} from "@/lib/generated-video-types"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

export type {
  GeneratedVideoCreatePayload,
  GeneratedVideoExport,
  GeneratedVideoStatus,
  GeneratedVideoType,
}

export type GeneratedVideoListFilters = {
  rootDir?: string
  type?: GeneratedVideoType
  automationId?: string
}

const defaultGeneratedVideoRoot = path.join(
  process.cwd(),
  "data",
  "generated-videos"
)
const dbFileName = "exports.json"

export async function listGeneratedVideoExports(
  filters: GeneratedVideoListFilters = {}
) {
  const records = await readGeneratedVideoExports(filters.rootDir)
  return records.filter(
    (record) =>
      (!filters.type || record.type === filters.type) &&
      (!filters.automationId ||
        record.sourceConfig.automationId === filters.automationId)
  )
}

export async function createGeneratedVideoExport(
  input: GeneratedVideoCreatePayload & { rootDir?: string }
) {
  const now = new Date().toISOString()
  const status = isGeneratedVideoStatus(input.status) ? input.status : "queued"
  const record: GeneratedVideoExport = {
    id: randomUUID(),
    type: input.type,
    status,
    createdAt: now,
    updatedAt: now,
    title: clean(input.title) || defaultTitle(input.type),
    description: clean(input.description) || clean(input.caption),
    hashtags: normalizeHashtags(input.hashtags),
    caption: clean(input.description) || clean(input.caption),
    sourceConfig: sanitizeSourceConfig(
      input.sourceConfig,
      localMediaUrl(input.previewUrl)
    ),
    previewUrl: localMediaUrl(input.previewUrl),
    videoUrl: localMediaUrl(input.videoUrl),
  }

  const rootDir = input.rootDir ?? defaultGeneratedVideoRoot
  const records = await readGeneratedVideoExports(rootDir)
  record.queuePosition =
    status === "queued" || status === "processing"
      ? nextQueuePosition(records)
      : undefined
  await writeGeneratedVideoExports(rootDir, [
    record,
    ...records.filter((item) => item.id !== record.id),
  ])
  return record
}

export async function updateGeneratedVideoExport(input: {
  rootDir?: string
  id: string
  status?: GeneratedVideoStatus
  previewUrl?: string
  videoUrl?: string
  error?: string
}): Promise<GeneratedVideoExport | null> {
  const rootDir = input.rootDir ?? defaultGeneratedVideoRoot
  const records = await readGeneratedVideoExports(rootDir)
  const updatedAt = new Date().toISOString()
  const recordIndex = records.findIndex((record) => record.id === input.id)

  if (recordIndex === -1) {
    return null
  }

  const updated: GeneratedVideoExport = {
    ...records[recordIndex],
    status: input.status ?? records[recordIndex].status,
    queuePosition:
      input.status === "ready" || input.status === "failed"
        ? undefined
        : records[recordIndex].queuePosition,
    previewUrl:
      localMediaUrl(input.previewUrl) || records[recordIndex].previewUrl,
    videoUrl:
      input.videoUrl === undefined
        ? records[recordIndex].videoUrl
        : localMediaUrl(input.videoUrl) || records[recordIndex].videoUrl,
    error:
      input.error === undefined
        ? records[recordIndex].error
        : clean(input.error) || undefined,
    updatedAt,
  }
  updated.sourceConfig = sanitizeSourceConfig(
    updated.sourceConfig,
    updated.previewUrl
  )
  const next = records.toSpliced(recordIndex, 1, updated)

  await writeGeneratedVideoExports(rootDir, next)
  return updated
}

export async function deleteGeneratedVideoExport(input: {
  rootDir?: string
  assetRootDir?: string
  id: string
}): Promise<GeneratedVideoExport | null> {
  const rootDir = input.rootDir ?? defaultGeneratedVideoRoot
  const records = await readGeneratedVideoExports(rootDir)
  const deleted = records.find((record) => record.id === input.id) ?? null

  if (!deleted) {
    return null
  }

  const next = records.filter((record) => record.id !== input.id)
  await writeGeneratedVideoExports(rootDir, next)
  await deleteAssetRecordsForUrls({
    rootDir: input.assetRootDir,
    urls: [deleted.previewUrl, deleted.videoUrl].map(clean).filter(Boolean),
    keepUrls: next.flatMap((record) =>
      [record.previewUrl, record.videoUrl].map(clean).filter(Boolean)
    ),
  })
  return deleted
}

async function readGeneratedVideoExports(
  rootDir = defaultGeneratedVideoRoot
): Promise<GeneratedVideoExport[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "exports",
    normalize: normalizeGeneratedVideoExport,
  })
}

async function writeGeneratedVideoExports(
  rootDir: string,
  records: GeneratedVideoExport[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "exports",
    records,
  })
}

function normalizeGeneratedVideoExport(
  record: GeneratedVideoExport
): GeneratedVideoExport | null {
  if (!record?.id || !isGeneratedVideoType(record.type)) {
    return null
  }

  return {
    ...record,
    status: isGeneratedVideoStatus(record.status) ? record.status : "queued",
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    updatedAt:
      clean(record.updatedAt) ||
      clean(record.createdAt) ||
      new Date().toISOString(),
    title: clean(record.title) || defaultTitle(record.type),
    description: clean(record.description) || clean(record.caption),
    hashtags: normalizeHashtags(record.hashtags),
    caption: clean(record.caption) || clean(record.description),
    sourceConfig: sanitizeSourceConfig(
      record.sourceConfig,
      localMediaUrl(record.previewUrl)
    ),
    queuePosition: numberValue(record.queuePosition),
    previewUrl: localMediaUrl(record.previewUrl),
    videoUrl: localMediaUrl(record.videoUrl),
    error: clean(record.error) || undefined,
  }
}

export function isGeneratedVideoType(
  value: unknown
): value is GeneratedVideoType {
  return (
    value === "greenscreen" || value === "ugc_ad" || value === "template_video"
  )
}

function isGeneratedVideoStatus(value: unknown): value is GeneratedVideoStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  )
}

function defaultTitle(type: GeneratedVideoType) {
  return generatedVideoTypeConfig[type].title
}

function normalizeHashtags(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\s+/)
      : []
  return [
    ...new Set(
      entries
        .map(clean)
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    ),
  ]
}

function nextQueuePosition(records: GeneratedVideoExport[]) {
  return (
    records
      .filter(
        (record) => record.status === "queued" || record.status === "processing"
      )
      .reduce(
        (position, record) => Math.max(position, record.queuePosition ?? 0),
        0
      ) + 1
  )
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function localMediaUrl(value: unknown) {
  const url = clean(value)
  return isLocalAppUrl(url) ? url : undefined
}

function isLocalAppUrl(url: string) {
  return (
    url.startsWith("/api/local-assets/") ||
    url.startsWith("/api/swipes/assets/") ||
    (url.startsWith("/") && !url.startsWith("//"))
  )
}

function sanitizeSourceConfig(
  value: unknown,
  previewUrl?: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {}
  }

  const next: Record<string, unknown> = { ...value }
  if (isRecord(next.background)) {
    const background = { ...next.background }
    const imageUrl = localMediaUrl(background.imageUrl)
    const sourceUrl = localMediaUrl(background.sourceUrl)

    delete background.imageUrl
    delete background.sourceUrl
    if (imageUrl || previewUrl) {
      background.imageUrl = imageUrl || previewUrl
    }
    if (sourceUrl) {
      background.sourceUrl = sourceUrl
    }
    next.background = background
  }

  return next
}
