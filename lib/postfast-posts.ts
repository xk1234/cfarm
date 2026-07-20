import { clean } from "@/lib/guards"
import { randomUUID } from "node:crypto"

import {
  listOutputPublications,
  listOutputPublicationsForSources,
  writeOutputPublications,
} from "@/lib/output-publications"
import type { PostFastMedia } from "@/lib/postfast-client"

export type PostFastPostStatus =
  | "awaiting_manual_post"
  | "ready_for_review"
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
export type PostFastSourceType =
  | "automation"
  | "x_automation"
  | "generated_video"
  | "asset"
  | "greenscreen"
  | "ugc_ad"
  | "image"
  | "swipe" // legacy
  | "slideshow"
  | "manual"
  | "external"

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
  publishedAt?: string
  releaseUrl?: string
  externallyManaged?: boolean
  externalPostId?: string
  content: string
  media: PostFastMedia[]
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  lastAnalyticsSyncedAt?: string
  analytics?: PostFastAnalyticsMetric[]
  error?: string
}

export async function listPostFastPostRecords(
  filters: {
    rootDir?: string
    sourceType?: PostFastSourceType
    sourceIds?: string[]
    integrationId?: string
  } = {}
) {
  const sourceIds = new Set(
    (filters.sourceIds ?? []).map(clean).filter(Boolean)
  )
  const records = sourceIds.size
    ? await readTargetedPostFastPostRecords([...sourceIds])
    : await readPostFastPostRecords(filters.rootDir)
  return records.filter(
    (record) =>
      (!filters.sourceType || record.sourceType === filters.sourceType) &&
      (sourceIds.size === 0 ||
        sourceIds.has(record.sourceId) ||
        sourceIds.has(baseSourceId(record.sourceId))) &&
      (!filters.integrationId || record.integrationId === filters.integrationId)
  )
}

async function readTargetedPostFastPostRecords(sourceIds: string[]) {
  return (
    await listOutputPublicationsForSources({
      entityIds: sourceIds,
      runIds: sourceIds,
    })
  ).flatMap((record) => {
    const normalized = normalizeRecord(record)
    return normalized ? [normalized] : []
  })
}

export async function upsertPostFastPostRecord(
  input: Omit<Partial<PostFastPostRecord>, "id" | "createdAt" | "updatedAt"> & {
    rootDir?: string
    sourceType: PostFastSourceType
    sourceId: string
    integrationId: string
    provider: string
    status: PostFastPostStatus
    content: string
    media: PostFastMedia[]
  }
) {
  const rootDir = input.rootDir
  const records = await readPostFastPostRecords(rootDir)
  const now = new Date().toISOString()
  const existing = records.find(
    (record) =>
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
    publishedAt:
      clean(input.publishedAt) ||
      (input.status === "published"
        ? (existing?.publishedAt ?? now)
        : existing?.publishedAt),
    releaseUrl: clean(input.releaseUrl) || existing?.releaseUrl,
    externallyManaged: input.externallyManaged ?? existing?.externallyManaged,
    externalPostId: clean(input.externalPostId) || existing?.externalPostId,
    content: input.content,
    media: input.media,
    analytics: input.analytics ?? existing?.analytics,
    lastAnalyticsSyncedAt:
      input.lastAnalyticsSyncedAt ?? existing?.lastAnalyticsSyncedAt,
    lastSyncedAt: now,
    error: clean(input.error) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await writePostFastPostRecords(rootDir, [
    record,
    ...records.filter((item) => item.id !== record.id),
  ])
  await recordHookPublication(record)
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

export async function getPostFastPostRecord(id: string) {
  const records = await readPostFastPostRecords()
  return records.find((record) => record.id === clean(id)) ?? null
}

export async function patchPostFastPostRecord(input: {
  id: string
  status?: PostFastPostStatus
  scheduledAt?: string
  publishedAt?: string | null
  postfastPostId?: string
  releaseUrl?: string
  error?: string | null
}) {
  const records = await readPostFastPostRecords()
  const current = records.find((record) => record.id === clean(input.id))
  if (!current) return null
  const now = new Date().toISOString()
  const updated: PostFastPostRecord = {
    ...current,
    status: input.status ?? current.status,
    scheduledAt:
      input.scheduledAt === undefined
        ? current.scheduledAt
        : clean(input.scheduledAt) || undefined,
    publishedAt:
      input.publishedAt === null
        ? undefined
        : input.publishedAt !== undefined
          ? clean(input.publishedAt) || undefined
          : input.status === "published"
            ? (current.publishedAt ?? now)
            : current.publishedAt,
    postfastPostId:
      input.postfastPostId === undefined
        ? current.postfastPostId
        : clean(input.postfastPostId) || undefined,
    releaseUrl:
      input.releaseUrl === undefined
        ? current.releaseUrl
        : clean(input.releaseUrl) || undefined,
    error:
      input.error === undefined
        ? current.error
        : clean(input.error) || undefined,
    updatedAt: now,
    lastSyncedAt: now,
  }
  await writePostFastPostRecords(
    undefined,
    records.map((record) => (record.id === updated.id ? updated : record))
  )
  await recordHookPublication(updated)
  return updated
}

async function recordHookPublication(record: PostFastPostRecord) {
  if (record.status !== "published") return
  await import("@/lib/hook-publications")
    .then(({ recordPublishedHookUsage }) => recordPublishedHookUsage(record))
    .catch(() => undefined)
}

export async function deletePostFastPostRecordById(id: string) {
  const records = await readPostFastPostRecords()
  const current = records.find((record) => record.id === clean(id))
  if (!current) return null
  await writePostFastPostRecords(
    undefined,
    records.filter((record) => record.id !== current.id)
  )
  return current
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

async function readPostFastPostRecords(
  rootDir?: string
): Promise<PostFastPostRecord[]> {
  void rootDir
  return (await listOutputPublications()).flatMap((record) => {
    const normalized = normalizeRecord(record)
    return normalized ? [normalized] : []
  })
}

async function writePostFastPostRecords(
  _rootDir: string | undefined,
  records: PostFastPostRecord[]
) {
  await writeOutputPublications(records)
}

function normalizeRecord(
  record: PostFastPostRecord
): PostFastPostRecord | null {
  if (
    !record?.id ||
    !record.sourceType ||
    !record.sourceId ||
    !record.integrationId ||
    !record.provider
  ) {
    return null
  }
  return {
    ...record,
    status: isStatus(record.status) ? record.status : "draft",
    content: clean(record.content),
    media: Array.isArray(record.media) ? record.media : [],
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    updatedAt:
      clean(record.updatedAt) ||
      clean(record.createdAt) ||
      new Date().toISOString(),
  }
}

function isStatus(value: unknown): value is PostFastPostStatus {
  return (
    value === "awaiting_manual_post" ||
    value === "ready_for_review" ||
    value === "draft" ||
    value === "scheduled" ||
    value === "published" ||
    value === "failed"
  )
}

function baseSourceId(sourceId: string) {
  return clean(sourceId).split(":")[0] ?? ""
}
