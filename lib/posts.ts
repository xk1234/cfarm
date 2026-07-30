import { clean, isRecord } from "@/lib/guards"
import {
  normalizePostFastProvider,
  type PostFastMedia,
  type PostFastSocialProvider,
} from "@/lib/postfast-client"
import type {
  PostFastPostRecord,
  PostFastPostStatus,
  PostFastSourceType,
  PostFastStatsSource,
} from "@/lib/postfast-posts"

export type PostLifecycleStatus =
  "generated" | "ready" | "scheduled" | "published" | "failed"

export type PostLinkState =
  "unlinked" | "postfast_managed" | "externally_linked"

export type PostOrigin =
  | "automation_generation"
  | "composer"
  | "manual_link"
  | "postfast_publish"
  | "postfast_sync"
  | "tiktok_publication_import"
  | "tiktok_studio_import"
  | "migration"

export type PostSourceRef = {
  kind:
    | "output"
    | "automation"
    | "run"
    | "slideshow"
    | "generated_video"
    | "x_automation"
    | "external"
  id: string
}

export type PostMedia = {
  id?: string
  kind: "image" | "video" | "thumbnail"
  url?: string
  postfastKey?: string
  order: number
}

export type Post = {
  schemaVersion: 1
  id: string
  intentId: string
  ownerId: string
  origin: PostOrigin
  sourceType?: PostFastSourceType
  sourceId?: string
  sourceRefs: PostSourceRef[]
  outputId?: string
  automationId?: string
  runId?: string
  sourceEntityId?: string
  lifecycleStatus: PostLifecycleStatus
  publishMode?: "auto" | "review" | "manual"
  linkState: PostLinkState
  linkMethod?:
    | "postfast"
    | "manual_url"
    | "tiktok_publication_import"
    | "tiktok_studio"
    | "analytics_sync"
  integrationId?: string
  provider?: PostFastSocialProvider
  postfastPostId?: string
  externalPostId?: string
  releaseUrl?: string
  statsSources: PostFastStatsSource[]
  title?: string
  content: string
  hashtags: string[]
  contentType?: "slideshow" | "video" | "image" | "text"
  media: PostMedia[]
  generatedAt?: string
  readyAt?: string
  scheduledAt?: string
  publishedAt?: string
  linkedAt?: string
  failedAt?: string
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string
  error?: { code?: string; message: string; retryable?: boolean }
  mergedIntoId?: string
}

export type PostIdentityKind =
  "post_id" | "postfast" | "provider_external" | "intent" | "legacy_source"

export type PostIdentityClaim = {
  kind: PostIdentityKind
  key: string
}

export type PostIdentityInput = {
  ownerId: string
  id?: string
  intentId?: string
  integrationId?: string
  provider?: string
  postfastPostId?: string
  externalPostId?: string
  outputId?: string
  destinationKey?: string
}

export function normalizePost(value: unknown): Post | null {
  const record = isRecord(value) ? value : {}
  const id = clean(record.id)
  const intentId = clean(record.intentId)
  const ownerId = clean(record.ownerId)
  const origin = normalizeOrigin(record.origin)
  const lifecycleStatus = normalizeLifecycleStatus(record.lifecycleStatus)
  if (!id || !intentId || !ownerId || !origin || !lifecycleStatus) return null

  const provider = normalizePostProvider(record.provider)
  const sourceType = normalizeSourceType(record.sourceType)
  const sourceId = clean(record.sourceId) || undefined
  const createdAt = clean(record.createdAt)
  const updatedAt = clean(record.updatedAt) || createdAt
  if (!createdAt || !updatedAt) return null

  return {
    schemaVersion: 1,
    id,
    intentId,
    ownerId,
    origin,
    sourceType,
    sourceId,
    sourceRefs: normalizeSourceRefs(record.sourceRefs),
    outputId: clean(record.outputId) || undefined,
    automationId: clean(record.automationId) || undefined,
    runId: clean(record.runId) || undefined,
    sourceEntityId: clean(record.sourceEntityId) || undefined,
    lifecycleStatus,
    publishMode: normalizePublishMode(record.publishMode),
    linkState: normalizeLinkState(record.linkState),
    linkMethod: normalizeLinkMethod(record.linkMethod),
    integrationId: clean(record.integrationId) || undefined,
    provider: provider ?? undefined,
    postfastPostId: clean(record.postfastPostId) || undefined,
    externalPostId: clean(record.externalPostId) || undefined,
    releaseUrl: clean(record.releaseUrl) || undefined,
    statsSources: normalizeStatsSources(record.statsSources),
    title: clean(record.title) || undefined,
    content: clean(record.content),
    hashtags: normalizeStrings(record.hashtags),
    contentType: normalizeContentType(record.contentType),
    media: normalizeMedia(record.media),
    generatedAt: clean(record.generatedAt) || undefined,
    readyAt: clean(record.readyAt) || undefined,
    scheduledAt: clean(record.scheduledAt) || undefined,
    publishedAt: clean(record.publishedAt) || undefined,
    linkedAt: clean(record.linkedAt) || undefined,
    failedAt: clean(record.failedAt) || undefined,
    lastSyncedAt: clean(record.lastSyncedAt) || undefined,
    createdAt,
    updatedAt,
    error: normalizeError(record.error),
    mergedIntoId: clean(record.mergedIntoId) || undefined,
  }
}

export function postFromPostFastRecord(
  record: PostFastPostRecord,
  ownerId: string
): Post {
  const lifecycle = lifecycleFromPostFastStatus(record.status)
  const sourceRef = sourceRefFromLegacy(record.sourceType, record.sourceId)
  const provider = normalizePostProvider(record.provider)
  const post: Post = {
    schemaVersion: 1,
    id: record.id,
    intentId: `legacy:${record.id}`,
    ownerId: clean(ownerId),
    origin: originFromLegacy(record),
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    sourceRefs: sourceRef ? [sourceRef] : [],
    lifecycleStatus: lifecycle.lifecycleStatus,
    publishMode: lifecycle.publishMode,
    linkState:
      record.linkState === "postfast_published"
        ? "postfast_managed"
        : record.linkState === "manually_linked"
          ? "externally_linked"
          : "unlinked",
    linkMethod:
      record.linkState === "postfast_published"
        ? "postfast"
        : record.linkState === "manually_linked"
          ? record.statsSources.includes("tiktok_studio")
            ? "tiktok_studio"
            : record.sourceType === "external"
              ? "analytics_sync"
              : "manual_url"
          : undefined,
    integrationId: record.integrationId,
    provider: provider ?? undefined,
    postfastPostId: record.postfastPostId,
    externalPostId: record.externalPostId,
    releaseUrl: record.releaseUrl,
    statsSources: normalizeStatsSources(record.statsSources),
    content: clean(record.content),
    hashtags: [],
    media: record.media.map(mediaFromPostFast),
    scheduledAt: record.scheduledAt,
    publishedAt: record.publishedAt,
    lastSyncedAt: record.lastSyncedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error ? { message: record.error } : undefined,
  }
  return normalizePost(post) ?? post
}

export function postToPostFastRecord(post: Post): PostFastPostRecord {
  if (!post.sourceType || !post.sourceId) {
    throw new Error("Legacy post storage requires a source type and source id.")
  }
  if (!post.integrationId || !post.provider) {
    throw new Error(
      "Legacy post storage requires an integration and social provider."
    )
  }
  return {
    id: post.id,
    sourceType: post.sourceType,
    sourceId: post.sourceId,
    postfastPostId: post.postfastPostId,
    integrationId: post.integrationId,
    provider: post.provider,
    status: postFastStatusFromLifecycle(post),
    scheduledAt: post.scheduledAt,
    publishedAt: post.publishedAt,
    releaseUrl: post.releaseUrl,
    linkState:
      post.linkState === "postfast_managed"
        ? "postfast_published"
        : post.linkState === "externally_linked"
          ? "manually_linked"
          : "unlinked",
    statsSources: normalizeStatsSources(post.statsSources),
    externalPostId: post.externalPostId,
    content: post.content,
    media: post.media.flatMap(mediaToPostFast),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    lastSyncedAt: post.lastSyncedAt,
    error: post.error?.message,
  }
}

export function postIdentityClaims(
  input: PostIdentityInput
): PostIdentityClaim[] {
  const ownerId = clean(input.ownerId)
  if (!ownerId) return []
  const claims: PostIdentityClaim[] = []
  const add = (kind: PostIdentityKind, values: string[]) => {
    if (values.every(Boolean)) {
      claims.push({ kind, key: JSON.stringify([kind, ownerId, ...values]) })
    }
  }

  add("post_id", [clean(input.id)])
  add("postfast", [clean(input.integrationId), clean(input.postfastPostId)])
  add("provider_external", [
    normalizeIdentityProvider(input.provider),
    clean(input.integrationId),
    clean(input.externalPostId),
  ])
  add("intent", [clean(input.intentId)])
  add("legacy_source", [clean(input.outputId), clean(input.destinationKey)])
  return claims
}

export function postIdentityClaimsForPost(post: Post) {
  return postIdentityClaims(post)
}

export function normalizeIdentityProvider(value: unknown) {
  const provider = normalizePostProvider(value)
  return provider === "twitter" ? "x" : (provider ?? "")
}

export function normalizePostProvider(
  value: unknown
): PostFastSocialProvider | null {
  return normalizePostFastProvider(clean(value))
}

export function lifecycleFromPostFastStatus(status: PostFastPostStatus): {
  lifecycleStatus: PostLifecycleStatus
  publishMode?: "review" | "manual"
} {
  if (status === "ready_for_review") {
    return { lifecycleStatus: "ready", publishMode: "review" }
  }
  if (status === "awaiting_manual_post") {
    return { lifecycleStatus: "ready", publishMode: "manual" }
  }
  if (status === "scheduled") return { lifecycleStatus: "scheduled" }
  if (status === "published") return { lifecycleStatus: "published" }
  if (status === "failed") return { lifecycleStatus: "failed" }
  return { lifecycleStatus: "generated" }
}

function postFastStatusFromLifecycle(post: Post): PostFastPostStatus {
  if (post.lifecycleStatus === "ready") {
    if (post.publishMode === "review") return "ready_for_review"
    if (post.publishMode === "manual") return "awaiting_manual_post"
    return "draft"
  }
  if (post.lifecycleStatus === "generated") return "draft"
  return post.lifecycleStatus
}

function sourceRefFromLegacy(
  sourceType: PostFastSourceType,
  sourceId: string
): PostSourceRef | null {
  const kind =
    sourceType === "automation"
      ? "run"
      : sourceType === "slideshow"
        ? "slideshow"
        : sourceType === "generated_video" ||
            sourceType === "greenscreen" ||
            sourceType === "ugc_ad"
          ? "generated_video"
          : sourceType === "x_automation"
            ? "x_automation"
            : sourceType === "external" ||
                sourceType === "manual" ||
                sourceType === "asset" ||
                sourceType === "image"
              ? "external"
              : null
  return kind ? { kind, id: sourceId } : null
}

function originFromLegacy(record: PostFastPostRecord): PostOrigin {
  if (record.sourceType === "external") {
    return record.statsSources.includes("tiktok_studio")
      ? "tiktok_studio_import"
      : "postfast_sync"
  }
  if (record.linkState === "manually_linked") return "manual_link"
  if (record.linkState === "postfast_published") return "postfast_publish"
  return "automation_generation"
}

function mediaFromPostFast(media: PostFastMedia, index: number): PostMedia {
  return {
    kind: media.type === "VIDEO" ? "video" : "image",
    postfastKey: media.key,
    order: media.sortOrder ?? index,
  }
}

function mediaToPostFast(media: PostMedia): PostFastMedia[] {
  if (!media.postfastKey || media.kind === "thumbnail") return []
  return [
    {
      key: media.postfastKey,
      type: media.kind === "video" ? "VIDEO" : "IMAGE",
      sortOrder: media.order,
    },
  ]
}

function normalizeSourceRefs(value: unknown): PostSourceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = isRecord(item) ? item : {}
    const kind = clean(record.kind) as PostSourceRef["kind"]
    const id = clean(record.id)
    return id &&
      [
        "output",
        "automation",
        "run",
        "slideshow",
        "generated_video",
        "x_automation",
        "external",
      ].includes(kind)
      ? [{ kind, id }]
      : []
  })
}

function normalizeMedia(value: unknown): PostMedia[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const record = isRecord(item) ? item : {}
    const kind = clean(record.kind) as PostMedia["kind"]
    if (!["image", "video", "thumbnail"].includes(kind)) return []
    return [
      {
        id: clean(record.id) || undefined,
        kind,
        url: clean(record.url) || undefined,
        postfastKey: clean(record.postfastKey) || undefined,
        order: Number.isFinite(Number(record.order))
          ? Number(record.order)
          : index,
      },
    ]
  })
}

function normalizeStatsSources(value: unknown): PostFastStatsSource[] {
  const sources = new Set(Array.isArray(value) ? value : [])
  return (["postfast", "tiktok_studio"] as const).filter((source) =>
    sources.has(source)
  )
}

function normalizeStrings(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
}

function normalizeError(value: unknown): Post["error"] {
  const record = isRecord(value) ? value : {}
  const message = clean(record.message)
  if (!message) return undefined
  return {
    code: clean(record.code) || undefined,
    message,
    retryable:
      typeof record.retryable === "boolean" ? record.retryable : undefined,
  }
}

function normalizeOrigin(value: unknown): PostOrigin | null {
  const origin = clean(value) as PostOrigin
  return [
    "automation_generation",
    "composer",
    "manual_link",
    "postfast_publish",
    "postfast_sync",
    "tiktok_publication_import",
    "tiktok_studio_import",
    "migration",
  ].includes(origin)
    ? origin
    : null
}

function normalizeLifecycleStatus(value: unknown): PostLifecycleStatus | null {
  const status = clean(value) as PostLifecycleStatus
  return ["generated", "ready", "scheduled", "published", "failed"].includes(
    status
  )
    ? status
    : null
}

function normalizeLinkState(value: unknown): PostLinkState {
  return value === "postfast_managed" || value === "externally_linked"
    ? value
    : "unlinked"
}

function normalizePublishMode(value: unknown): Post["publishMode"] {
  return value === "auto" || value === "review" || value === "manual"
    ? value
    : undefined
}

function normalizeLinkMethod(value: unknown): Post["linkMethod"] {
  return value === "postfast" ||
    value === "manual_url" ||
    value === "tiktok_publication_import" ||
    value === "tiktok_studio" ||
    value === "analytics_sync"
    ? value
    : undefined
}

function normalizeContentType(value: unknown): Post["contentType"] {
  return value === "slideshow" ||
    value === "video" ||
    value === "image" ||
    value === "text"
    ? value
    : undefined
}

function normalizeSourceType(value: unknown): PostFastSourceType | undefined {
  const sourceType = clean(value) as PostFastSourceType
  return [
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
  ].includes(sourceType)
    ? sourceType
    : undefined
}
