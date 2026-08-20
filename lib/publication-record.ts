import contractFixture from "@/lib/publication-record.contract.json"

import type { PostFastMedia } from "@/lib/postfast-client"
import type {
  PostFastAnalyticsMetric,
  PostFastPostRecord,
  PostFastPostStatus,
  PostFastSourceType,
  PostFastStatsSource,
  PublicationLinkState,
} from "@/lib/publication-contract"

const STATUSES = [
  "awaiting_manual_post",
  "ready_for_review",
  "draft",
  "scheduled",
  "published",
  "failed",
] as const satisfies readonly PostFastPostStatus[]

const SOURCE_TYPES = [
  "automation",
  "x_automation",
  "generated_video",
  "asset",
  "greenscreen",
  "ugc_ad",
  "image",
  "slideshow",
  "manual",
  "external",
] as const satisfies readonly PostFastSourceType[]

const LINK_STATES = [
  "postfast_published",
  "manually_linked",
  "unlinked",
] as const satisfies readonly PublicationLinkState[]

const STATS_SOURCES = [
  "postfast",
  "tiktok_studio",
] as const satisfies readonly PostFastStatsSource[]

const ALLOWED_KEYS = new Set([
  "id",
  "sourceType",
  "sourceId",
  "postfastPostId",
  "integrationId",
  "provider",
  "status",
  "scheduledAt",
  "publishedAt",
  "releaseUrl",
  "linkState",
  "statsSources",
  "externalPostId",
  "content",
  "media",
  "createdAt",
  "updatedAt",
  "lastSyncedAt",
  "lastAnalyticsSyncedAt",
  "analytics",
  "error",
  // Slideshow legacy rows already contain this redundant ownership field.
  // Keep accepting it until the legacy publications column is retired.
  "ownerId",
])

export type PublicationRecord = PostFastPostRecord & { ownerId?: string }

export type PublicationRecordInput = {
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
  linkState?: PublicationLinkState
  statsSources?: readonly PostFastStatsSource[]
  externalPostId?: string
  content: string
  media: PostFastMedia[]
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  lastAnalyticsSyncedAt?: string
  analytics?: PostFastAnalyticsMetric[]
  error?: string
  ownerId?: string
}

export const publicationRecordContractFixture = contractFixture

/** Pure constructor for the legacy publication record stored on outputs. */
export function buildPublicationRecord(
  input: PublicationRecordInput
): PublicationRecord {
  const record = normalizePublicationRecord(input)
  if (!record) {
    throw new Error("A valid publication record is required.")
  }
  return record
}

/**
 * Normalizes records from old embedded-output writers without using an
 * Appwrite client, repository, clock, or runtime-specific APIs.
 */
export function normalizePublicationRecord(
  value: unknown
): PublicationRecord | null {
  if (!isObject(value)) return null
  const id = clean(value.id)
  const sourceType = clean(value.sourceType)
  const sourceId = clean(value.sourceId)
  const integrationId = clean(value.integrationId)
  const provider = clean(value.provider)
  const createdAt = clean(value.createdAt)
  const updatedAt = clean(value.updatedAt) || createdAt
  if (
    !id ||
    !isSourceType(sourceType) ||
    !sourceId ||
    !integrationId ||
    !provider ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  return {
    id,
    sourceType,
    sourceId,
    postfastPostId: optionalString(value.postfastPostId),
    integrationId,
    provider,
    status: isStatus(value.status) ? value.status : "draft",
    scheduledAt: optionalString(value.scheduledAt),
    publishedAt: optionalString(value.publishedAt),
    releaseUrl: optionalString(value.releaseUrl),
    linkState: isLinkState(value.linkState) ? value.linkState : "unlinked",
    statsSources: normalizeStatsSources(value.statsSources),
    externalPostId: optionalString(value.externalPostId),
    content: typeof value.content === "string" ? value.content : "",
    media: Array.isArray(value.media) ? (value.media as PostFastMedia[]) : [],
    createdAt,
    updatedAt,
    lastSyncedAt: optionalString(value.lastSyncedAt),
    lastAnalyticsSyncedAt: optionalString(value.lastAnalyticsSyncedAt),
    analytics: Array.isArray(value.analytics)
      ? (value.analytics as PostFastAnalyticsMetric[])
      : undefined,
    error: optionalString(value.error),
    ownerId: optionalString(value.ownerId),
  }
}

export function validatePublicationRecord(value: unknown): string[] {
  if (!isObject(value)) return ["record must be an object"]
  const errors: string[] = []
  for (const key of contractFixture.requiredKeys) {
    if (!(key in value)) errors.push(`missing required field: ${key}`)
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`unknown field: ${key}`)
  }
  if (!clean(value.id)) errors.push("id must be a non-empty string")
  if (!isSourceType(value.sourceType)) errors.push("sourceType is invalid")
  if (!clean(value.sourceId)) {
    errors.push("sourceId must be a non-empty string")
  }
  if (!clean(value.integrationId)) {
    errors.push("integrationId must be a non-empty string")
  }
  if (!clean(value.provider)) {
    errors.push("provider must be a non-empty string")
  }
  if (!isStatus(value.status)) errors.push("status is invalid")
  if (!isLinkState(value.linkState)) errors.push("linkState is invalid")
  if (!Array.isArray(value.statsSources)) {
    errors.push("statsSources must be an array")
  } else if (value.statsSources.some((source) => !isStatsSource(source))) {
    errors.push("statsSources contains an invalid value")
  }
  if (typeof value.content !== "string") errors.push("content must be a string")
  if (!Array.isArray(value.media)) errors.push("media must be an array")
  if (!clean(value.createdAt)) errors.push("createdAt must be a string")
  if (!clean(value.updatedAt)) errors.push("updatedAt must be a string")
  return errors
}

export function publicationRecordSummary(records: PublicationRecord[]) {
  const rank: PostFastPostStatus[] = [
    "published",
    "scheduled",
    "ready_for_review",
    "awaiting_manual_post",
    "failed",
    "draft",
  ]
  const primary = rank
    .flatMap((status) => records.filter((record) => record.status === status))
    .at(0)
  return {
    status: primary?.status ?? null,
    scheduledAt:
      records.find((record) => record.scheduledAt)?.scheduledAt ?? null,
    publishedAt:
      records.find((record) => record.publishedAt)?.publishedAt ?? null,
    postId:
      records.find((record) => record.postfastPostId)?.postfastPostId ?? null,
    releaseUrl: records.find((record) => record.releaseUrl)?.releaseUrl ?? null,
  }
}

function normalizeStatsSources(value: unknown): PostFastStatsSource[] {
  const sources = new Set(Array.isArray(value) ? value : [])
  return STATS_SOURCES.filter((source) => sources.has(source))
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function optionalString(value: unknown) {
  return clean(value) || undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStatus(value: unknown): value is PostFastPostStatus {
  return STATUSES.includes(value as PostFastPostStatus)
}

function isSourceType(value: unknown): value is PostFastSourceType {
  return SOURCE_TYPES.includes(value as PostFastSourceType)
}

function isLinkState(value: unknown): value is PublicationLinkState {
  return LINK_STATES.includes(value as PublicationLinkState)
}

function isStatsSource(value: unknown): value is PostFastStatsSource {
  return STATS_SOURCES.includes(value as PostFastStatsSource)
}
