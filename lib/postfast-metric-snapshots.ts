import crypto, { randomUUID } from "node:crypto"
import path from "node:path"

import {
  appendJsonArrayRecords,
  readJsonArrayStore,
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

function normalizeMetricSnapshot(value: PostFastMetricSnapshot) {
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
  }
}

function metricSnapshotId(postId: string, capturedAt: string) {
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
