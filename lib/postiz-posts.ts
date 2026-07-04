import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import type { PostizMedia } from "@/lib/postiz-client"

export type PostizPostStatus = "draft" | "scheduled" | "published" | "failed"
export type PostizSourceType = "automation" | "generated_video" | "asset" | "greenscreen" | "ugc_ad" | "image" | "swipe" | "slideshow" | "manual"

export type PostizAnalyticsPoint = {
  date: string
  total: string | number
}

export type PostizAnalyticsMetric = {
  label: string
  data: PostizAnalyticsPoint[]
  percentageChange?: number
}

export type PostizPostRecord = {
  id: string
  sourceType: PostizSourceType
  sourceId: string
  postizPostId?: string
  integrationId: string
  provider: string
  status: PostizPostStatus
  scheduledAt?: string
  releaseUrl?: string
  content: string
  media: PostizMedia[]
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  lastAnalyticsSyncedAt?: string
  analytics?: PostizAnalyticsMetric[]
  error?: string
}

const defaultRootDir = path.join(process.cwd(), "data")
const dbFileName = "postiz-posts.json"

export async function listPostizPostRecords(filters: { rootDir?: string; sourceType?: PostizSourceType; integrationId?: string } = {}) {
  const records = await readPostizPostRecords(filters.rootDir)
  return records.filter((record) =>
    (!filters.sourceType || record.sourceType === filters.sourceType) &&
    (!filters.integrationId || record.integrationId === filters.integrationId)
  )
}

export async function upsertPostizPostRecord(input: Omit<Partial<PostizPostRecord>, "id" | "createdAt" | "updatedAt"> & {
  rootDir?: string
  sourceType: PostizSourceType
  sourceId: string
  integrationId: string
  provider: string
  status: PostizPostStatus
  content: string
  media: PostizMedia[]
}) {
  const rootDir = input.rootDir
  const records = await readPostizPostRecords(rootDir)
  const now = new Date().toISOString()
  const existing = records.find((record) =>
    record.sourceType === input.sourceType &&
    record.sourceId === input.sourceId &&
    record.integrationId === input.integrationId
  )
  const record: PostizPostRecord = {
    id: existing?.id ?? randomUUID(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    postizPostId: clean(input.postizPostId) || existing?.postizPostId,
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

  await writePostizPostRecords(rootDir, [record, ...records.filter((item) => item.id !== record.id)])
  return record
}

export async function updatePostizPostAnalytics(input: {
  rootDir?: string
  id: string
  analytics: PostizAnalyticsMetric[]
}): Promise<PostizPostRecord | null> {
  const records = await readPostizPostRecords(input.rootDir)
  const now = new Date().toISOString()
  let updated: PostizPostRecord | null = null
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

  await writePostizPostRecords(input.rootDir, next)
  return updated
}

async function readPostizPostRecords(rootDir = defaultRootDir): Promise<PostizPostRecord[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "posts",
    normalize: normalizeRecord,
  })
}

async function writePostizPostRecords(rootDir = defaultRootDir, records: PostizPostRecord[]) {
  await writeJsonArrayStore({ rootDir, fileName: dbFileName, key: "posts", records })
}

function normalizeRecord(record: PostizPostRecord): PostizPostRecord | null {
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

function isStatus(value: unknown): value is PostizPostStatus {
  return value === "draft" || value === "scheduled" || value === "published" || value === "failed"
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
