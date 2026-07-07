import { clean } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import type { PostFastMedia } from "@/lib/postfast-client"

export type PostFastPostStatus = "draft" | "scheduled" | "published" | "failed"
export type PostFastSourceType = "automation" | "generated_video" | "asset" | "greenscreen" | "ugc_ad" | "image" | "swipe" | "slideshow" | "manual"

export type PostFastAnalyticsPoint = {
  date: string
  total: string | number
}

export type PostFastAnalyticsMetric = {
  label: string
  data: PostFastAnalyticsPoint[]
  percentageChange?: number
}

export type PostFastPostRecord = {
  id: string
  sourceType: PostFastSourceType
  sourceId: string
  postfastPostId?: string
  integrationId: string
  provider: string
  status: PostFastPostStatus
  scheduledAt?: string
  releaseUrl?: string
  content: string
  media: PostFastMedia[]
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  lastAnalyticsSyncedAt?: string
  analytics?: PostFastAnalyticsMetric[]
  error?: string
}

const defaultRootDir = path.join(process.cwd(), "data")
const dbFileName = "postfast-posts.json"

export async function listPostFastPostRecords(filters: { rootDir?: string; sourceType?: PostFastSourceType; integrationId?: string } = {}) {
  const records = await readPostFastPostRecords(filters.rootDir)
  return records.filter((record) =>
    (!filters.sourceType || record.sourceType === filters.sourceType) &&
    (!filters.integrationId || record.integrationId === filters.integrationId)
  )
}

export async function upsertPostFastPostRecord(input: Omit<Partial<PostFastPostRecord>, "id" | "createdAt" | "updatedAt"> & {
  rootDir?: string
  sourceType: PostFastSourceType
  sourceId: string
  integrationId: string
  provider: string
  status: PostFastPostStatus
  content: string
  media: PostFastMedia[]
}) {
  const rootDir = input.rootDir
  const records = await readPostFastPostRecords(rootDir)
  const now = new Date().toISOString()
  const existing = records.find((record) =>
    record.sourceType === input.sourceType &&
    record.sourceId === input.sourceId &&
    record.integrationId === input.integrationId
  )
  const record: PostFastPostRecord = {
    id: existing?.id ?? randomUUID(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    postfastPostId: clean(input.postfastPostId) || existing?.postfastPostId,
    integrationId: input.integrationId,
    provider: input.provider,
    status: input.status,
    scheduledAt: clean(input.scheduledAt) || undefined,
    releaseUrl: clean(input.releaseUrl) || existing?.releaseUrl,
    content: input.content,
    media: input.media,
    analytics: input.analytics ?? existing?.analytics,
    lastAnalyticsSyncedAt: input.lastAnalyticsSyncedAt ?? existing?.lastAnalyticsSyncedAt,
    lastSyncedAt: now,
    error: clean(input.error) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await writePostFastPostRecords(rootDir, [record, ...records.filter((item) => item.id !== record.id)])
  return record
}

export async function updatePostFastPostAnalytics(input: {
  rootDir?: string
  id: string
  analytics: PostFastAnalyticsMetric[]
}): Promise<PostFastPostRecord | null> {
  const records = await readPostFastPostRecords(input.rootDir)
  const now = new Date().toISOString()
  let updated: PostFastPostRecord | null = null
  const next = records.map((record) => {
    if (record.id !== input.id) {
      return record
    }
    updated = {
      ...record,
      analytics: input.analytics,
      lastAnalyticsSyncedAt: now,
      updatedAt: now,
    }
    return updated
  })

  await writePostFastPostRecords(input.rootDir, next)
  return updated
}

export async function deletePostFastPostRecords(input: {
  rootDir?: string
  sourceType?: PostFastSourceType
  sourceIds?: string[]
  integrationIds?: string[]
}) {
  const sourceIds = new Set((input.sourceIds ?? []).map(clean).filter(Boolean))
  const integrationIds = new Set(
    (input.integrationIds ?? []).map(clean).filter(Boolean)
  )
  if (!input.sourceType && sourceIds.size === 0 && integrationIds.size === 0) {
    return []
  }

  const records = await readPostFastPostRecords(input.rootDir)
  const deleted = records.filter((record) => {
    if (input.sourceType && record.sourceType !== input.sourceType) {
      return false
    }
    if (
      sourceIds.size > 0 &&
      !sourceIds.has(record.sourceId) &&
      !sourceIds.has(baseSourceId(record.sourceId))
    ) {
      return false
    }
    if (integrationIds.size > 0 && !integrationIds.has(record.integrationId)) {
      return false
    }
    return true
  })
  if (deleted.length === 0) {
    return []
  }

  const deletedIds = new Set(deleted.map((record) => record.id))
  await writePostFastPostRecords(
    input.rootDir,
    records.filter((record) => !deletedIds.has(record.id))
  )
  return deleted
}

async function readPostFastPostRecords(rootDir = defaultRootDir): Promise<PostFastPostRecord[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "posts",
    normalize: normalizeRecord,
  })
}

async function writePostFastPostRecords(rootDir = defaultRootDir, records: PostFastPostRecord[]) {
  await writeJsonArrayStore({ rootDir, fileName: dbFileName, key: "posts", records })
}

function normalizeRecord(record: PostFastPostRecord): PostFastPostRecord | null {
  if (!record?.id || !record.sourceType || !record.sourceId || !record.integrationId || !record.provider) {
    return null
  }
  return {
    ...record,
    status: isStatus(record.status) ? record.status : "draft",
    content: clean(record.content),
    media: Array.isArray(record.media) ? record.media : [],
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    updatedAt: clean(record.updatedAt) || clean(record.createdAt) || new Date().toISOString(),
  }
}

function isStatus(value: unknown): value is PostFastPostStatus {
  return value === "draft" || value === "scheduled" || value === "published" || value === "failed"
}


function baseSourceId(sourceId: string) {
  return clean(sourceId).split(":")[0] ?? ""
}
