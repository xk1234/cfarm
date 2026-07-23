import crypto, { randomUUID } from "node:crypto"
import path from "node:path"

import {
  appendJsonArrayRecords,
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
  withJsonArrayStore,
} from "@/lib/json-store"
import type { CanonicalMetric } from "@/lib/metric-registry"
import {
  inferPostContentType,
  type PostContentType,
} from "@/lib/post-content-type"

export type PostFastMetricSnapshot = {
  id: string
  postId: string
  platformPostId?: string
  integrationId: string
  provider: string
  capturedAt: string
  publishedAt?: string
  content?: string
  thumbnailUrl?: string
  releaseUrl?: string
  sourceType?: string
  sourceId?: string
  contentType?: PostContentType
  mediaCount?: number
  metrics: Partial<Record<CanonicalMetric, number>>
  latestMetric: Record<string, unknown>
  rawMetrics: Record<string, number>
  observedKeys: string[]
  source?: "postfast" | "tiktok_studio"
  tiktokStudio?: TikTokStudioAnalytics
}

export type TikTokStudioSlideMetric = {
  slideIndex: number
  retentionPercent?: number
  likeDistributionPercent?: number
  isRetentionDropPeak?: boolean
  isLikePeak?: boolean
}

export type TikTokStudioSearchTerm = {
  term: string
  percent: number
}

export type TikTokStudioAnalytics = {
  schemaVersion: 1
  studioUrl: string
  capturedSections: Array<"overview" | "viewers" | "engagement">
  overview?: {
    authorUsername?: string
    caption?: string
    publishedAt?: string
    photoCount?: number
    views?: number
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    totalWatchTimeSeconds?: number
    averageWatchTimeSeconds?: number
    fullWatchPercent?: number
    newFollowers?: number
  }
  slides: TikTokStudioSlideMetric[]
  trafficSources: Record<string, number>
  searchTerms: TikTokStudioSearchTerm[]
  audience?: {
    uniqueViewers?: number
    newViewerPercent?: number
    returningViewerPercent?: number
    followerPercent?: number
    nonFollowerPercent?: number
    agePercent: Record<string, number>
    genderPercent: Record<string, number>
    countryPercent: Record<string, number>
  }
}

export type AccountFollowerSnapshot = {
  id: string
  integrationId: string
  provider: string
  capturedAt: string
  followers: number
  netChange?: number
}

const rootDir = path.join(process.cwd(), "data")

export function listMetricSnapshots() {
  return readJsonArrayStore<PostFastMetricSnapshot>({
    rootDir,
    fileName: "postfast-metric-snapshots.json",
    key: "snapshots",
    normalize: normalizeMetricSnapshot,
  })
}

export async function appendMetricSnapshots(
  snapshots: Omit<PostFastMetricSnapshot, "id">[]
) {
  if (snapshots.length === 0) return []
  const records = snapshots.map((snapshot) => ({
    ...snapshot,
    id: metricSnapshotId(snapshot.postId, snapshot.capturedAt),
  }))
  await appendJsonArrayRecords<PostFastMetricSnapshot>({
    rootDir,
    fileName: "postfast-metric-snapshots.json",
    key: "snapshots",
    records,
  })
  return records
}

export function getMetricSnapshot(id: string) {
  return readJsonArrayRecord<PostFastMetricSnapshot>({
    rootDir,
    fileName: "postfast-metric-snapshots.json",
    key: "snapshots",
    id,
    normalize: normalizeMetricSnapshot,
  })
}

export async function upsertMetricSnapshot(snapshot: PostFastMetricSnapshot) {
  await upsertJsonArrayRecord<PostFastMetricSnapshot>({
    rootDir,
    fileName: "postfast-metric-snapshots.json",
    key: "snapshots",
    record: snapshot,
    position: "first",
  })
  return snapshot
}

export function listFollowerSnapshots() {
  return readJsonArrayStore<AccountFollowerSnapshot>({
    rootDir,
    fileName: "account-follower-snapshots.json",
    key: "snapshots",
    normalize: normalizeFollowerSnapshot,
  })
}

export async function appendFollowerSnapshots(
  snapshots: Omit<AccountFollowerSnapshot, "id">[]
) {
  if (snapshots.length === 0) return []
  const records = snapshots.map((snapshot) => ({
    ...snapshot,
    id: randomUUID(),
  }))
  await withJsonArrayStore<AccountFollowerSnapshot, AccountFollowerSnapshot[]>({
    rootDir,
    fileName: "account-follower-snapshots.json",
    key: "snapshots",
    normalize: normalizeFollowerSnapshot,
    update: (current) => {
      const incomingKeys = new Set(
        records.map(
          (record) =>
            `${record.integrationId}:${record.capturedAt.slice(0, 10)}`
        )
      )
      return {
        records: [
          ...records,
          ...current.filter(
            (record) =>
              !incomingKeys.has(
                `${record.integrationId}:${record.capturedAt.slice(0, 10)}`
              )
          ),
        ]
          .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
          .slice(0, 10_000),
        result: records,
      }
    },
  })
  return records
}

function normalizeMetricSnapshot(
  value: PostFastMetricSnapshot
): PostFastMetricSnapshot | null {
  if (
    !value?.id ||
    !value.postId ||
    !value.integrationId ||
    !value.capturedAt
  ) {
    return null
  }
  return {
    ...value,
    provider: value.provider || "unknown",
    contentType:
      value.contentType ||
      inferPostContentType({
        sourceType: value.sourceType,
        metrics: value.rawMetrics,
      }),
    mediaCount: Math.max(0, Number(value.mediaCount) || 0),
    metrics: value.metrics ?? {},
    latestMetric: value.latestMetric ?? value.rawMetrics ?? {},
    rawMetrics: value.rawMetrics ?? {},
    observedKeys: Array.isArray(value.observedKeys) ? value.observedKeys : [],
    source: value.source === "tiktok_studio" ? "tiktok_studio" : "postfast",
    tiktokStudio: value.tiktokStudio,
  }
}

export function metricSnapshotId(postId: string, capturedAt: string) {
  return `s${crypto
    .createHash("sha256")
    .update(JSON.stringify([postId, capturedAt]))
    .digest("hex")
    .slice(0, 35)}`
}

function normalizeFollowerSnapshot(value: AccountFollowerSnapshot) {
  if (!value?.id || !value.integrationId || !value.capturedAt) return null
  return {
    ...value,
    provider: value.provider || "unknown",
    followers: Number(value.followers) || 0,
  }
}
