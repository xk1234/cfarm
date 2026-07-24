import crypto, { randomUUID } from "node:crypto"
import path from "node:path"

import { clean, isRecord } from "@/lib/guards"
import {
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
} from "@/lib/json-store"
import { normalizeMetricMap } from "@/lib/metric-registry"
import { inferPostContentType } from "@/lib/post-content-type"
import { parseManualPublicationUrl } from "@/lib/manual-publication"
import {
  listMetricSnapshots,
  getMetricSnapshot,
  metricSnapshotId,
  upsertMetricSnapshot,
  type PostFastMetricSnapshot,
  type TikTokStudioAnalytics,
  type TikTokStudioSearchTerm,
  type TikTokStudioSlideMetric,
} from "@/lib/postfast-metric-snapshots"
import {
  getPostFastPostRecord,
  listPostFastPostRecords,
  patchPostFastPostRecord,
  type PostFastPostRecord,
} from "@/lib/postfast-posts"
import { APPWRITE_API_KEY } from "@/lib/appwrite"

const rootDir = path.join(process.cwd(), "data")
const storeFile = "tiktok-studio-analytics/imports.json"
const storeKey = "imports"
const batchStoreFile = "tiktok-studio-analytics/batches.json"
const batchStoreKey = "batches"
const TOKEN_TTL_MS = 15 * 60 * 1000
const BATCH_TOKEN_TTL_MS = 60 * 60 * 1000
const DEVICE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000
const MAX_CAPTURE_BYTES = 2_500_000

export type TikTokStudioSection = "overview" | "viewers" | "engagement"

export type TikTokStudioOverview = {
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

export type TikTokStudioAudience = NonNullable<
  TikTokStudioAnalytics["audience"]
>

export type TikTokStudioParsedCapture = {
  externalPostId?: string
  sections: TikTokStudioSection[]
  overview?: TikTokStudioOverview
  slides: TikTokStudioSlideMetric[]
  trafficSources: Record<string, number>
  searchTerms: TikTokStudioSearchTerm[]
  audience?: TikTokStudioAudience
}

export type TikTokStudioImportRecord = {
  id: string
  status: "waiting" | "capturing" | "ready" | "linked" | "expired"
  targetPostId: string
  externalPostId: string
  integrationId: string
  studioUrl: string
  createdAt: string
  expiresAt: string
  updatedAt: string
  capturedSections: TikTokStudioSection[]
  capture?: TikTokStudioParsedCapture
  linkedSnapshotId?: string
}

export type TikTokStudioBatchMode = "new" | "recent" | "all"

export type TikTokStudioBatchRecord = {
  id: string
  status: "waiting" | "capturing" | "ready" | "complete" | "expired"
  integrationIds: string[]
  mode: TikTokStudioBatchMode
  recentDays?: number
  importIds: string[]
  createdAt: string
  expiresAt: string
  updatedAt: string
}

export type TikTokStudioBatchItem = Pick<
  TikTokStudioImportRecord,
  | "id"
  | "status"
  | "targetPostId"
  | "externalPostId"
  | "studioUrl"
  | "capturedSections"
  | "linkedSnapshotId"
>

export type TikTokStudioBatchView = TikTokStudioBatchRecord & {
  items: TikTokStudioBatchItem[]
  counts: {
    total: number
    captured: number
    linked: number
  }
}

type SingleCaptureTokenPayload = {
  version: 1
  ownerId: string
  captureId: string
  externalPostId: string
  expiresAt: string
}

type BatchCaptureTokenPayload = {
  version: 2
  ownerId: string
  captureId: string
  expiresAt: string
}

type DeviceCaptureTokenPayload = {
  version: 3
  ownerId: string
  deviceId: string
  expiresAt: string
}

type CaptureTokenPayload =
  | SingleCaptureTokenPayload
  | BatchCaptureTokenPayload
  | DeviceCaptureTokenPayload

export function createTikTokStudioDeviceAuthorization(input: {
  ownerId: string
  now?: Date
}) {
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + DEVICE_TOKEN_TTL_MS).toISOString()
  const deviceId = randomUUID()
  return {
    deviceId,
    expiresAt,
    captureToken: signCaptureToken({
      version: 3,
      ownerId: clean(input.ownerId),
      deviceId,
      expiresAt,
    }),
  }
}

export async function createTikTokStudioAnalyticsImport(input: {
  ownerId: string
  postId: string
  now?: Date
}) {
  const publication = await requireTikTokPublication(input.postId)
  const externalPostId = publicationExternalId(publication)
  if (!externalPostId) {
    throw new Error(
      "This TikTok publication has no platform post ID. Link its public TikTok URL first."
    )
  }
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS)
  const record: TikTokStudioImportRecord = {
    id: randomUUID(),
    status: "waiting",
    targetPostId: publication.id,
    externalPostId,
    integrationId: publication.integrationId,
    studioUrl: tiktokStudioUrl(externalPostId),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    updatedAt: now.toISOString(),
    capturedSections: [],
  }
  await saveImport(record)
  return {
    import: record,
    captureToken: signCaptureToken({
      version: 1,
      ownerId: clean(input.ownerId),
      captureId: record.id,
      externalPostId,
      expiresAt: record.expiresAt,
    }),
  }
}

export async function createTikTokStudioAnalyticsBatch(input: {
  ownerId: string
  integrationIds: string[]
  mode: TikTokStudioBatchMode
  recentDays?: number
  now?: Date
}) {
  const integrationIds = [
    ...new Set(input.integrationIds.map(clean).filter(Boolean)),
  ]
  if (integrationIds.length === 0) {
    throw new Error("Select at least one TikTok account")
  }
  const [publications, snapshots] = await Promise.all([
    listPostFastPostRecords(),
    listMetricSnapshots(),
  ])
  const selected = selectTikTokStudioBatchPublications({
    publications,
    snapshots,
    integrationIds,
    mode: input.mode,
    recentDays: input.recentDays,
    now: input.now,
  })
  if (selected.length === 0) {
    throw new Error(
      input.mode === "new"
        ? "Every linked TikTok post in this scope already has Studio analytics"
        : "No linked published TikTok posts were found in this scope"
    )
  }

  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + BATCH_TOKEN_TTL_MS)
  const imports = selected.map((publication) => {
    const externalPostId = publicationExternalId(publication)
    return {
      id: randomUUID(),
      status: "waiting" as const,
      targetPostId: publication.id,
      externalPostId,
      integrationId: publication.integrationId,
      studioUrl: tiktokStudioUrl(externalPostId),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      updatedAt: now.toISOString(),
      capturedSections: [],
    } satisfies TikTokStudioImportRecord
  })
  await Promise.all(imports.map(saveImport))

  const batch: TikTokStudioBatchRecord = {
    id: randomUUID(),
    status: "waiting",
    integrationIds,
    mode: input.mode,
    recentDays:
      input.mode === "recent"
        ? normalizeRecentDays(input.recentDays)
        : undefined,
    importIds: imports.map((record) => record.id),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    updatedAt: now.toISOString(),
  }
  await saveBatch(batch)
  return {
    batch: batchView(batch, imports),
    captureToken: signCaptureToken({
      version: 2,
      ownerId: clean(input.ownerId),
      captureId: batch.id,
      expiresAt: batch.expiresAt,
    }),
  }
}

export function selectTikTokStudioBatchPublications(input: {
  publications: PostFastPostRecord[]
  snapshots: PostFastMetricSnapshot[]
  integrationIds: string[]
  mode: TikTokStudioBatchMode
  recentDays?: number
  now?: Date
}) {
  const integrationIds = new Set(
    input.integrationIds.map(clean).filter(Boolean)
  )
  const studioPostIds = new Set(
    input.snapshots
      .filter((snapshot) => snapshot.source === "tiktok_studio")
      .flatMap((snapshot) => [
        clean(snapshot.postId),
        clean(snapshot.platformPostId),
      ])
      .filter(Boolean)
  )
  const cutoff =
    (input.now ?? new Date()).getTime() -
    normalizeRecentDays(input.recentDays) * 24 * 60 * 60 * 1000
  const byExternalId = new Map<string, PostFastPostRecord>()

  for (const publication of input.publications) {
    const externalPostId = publicationExternalId(publication)
    const publishedAt = Date.parse(
      publication.publishedAt || publication.createdAt
    )
    if (
      !integrationIds.has(publication.integrationId) ||
      !publication.provider.toLowerCase().startsWith("tiktok") ||
      !externalPostId ||
      (publication.status !== "published" && !publication.publishedAt) ||
      (input.mode === "new" &&
        (studioPostIds.has(publication.id) ||
          studioPostIds.has(externalPostId))) ||
      (input.mode === "recent" &&
        (!Number.isFinite(publishedAt) || publishedAt < cutoff))
    ) {
      continue
    }
    const existing = byExternalId.get(externalPostId)
    if (
      !existing ||
      Date.parse(publication.updatedAt) > Date.parse(existing.updatedAt)
    ) {
      byExternalId.set(externalPostId, publication)
    }
  }

  return [...byExternalId.values()].sort(
    (left, right) =>
      Date.parse(right.publishedAt || right.createdAt) -
      Date.parse(left.publishedAt || left.createdAt)
  )
}

export async function inspectTikTokStudioAnalyticsImport(importId: string) {
  const record = await readImport(importId)
  if (!record) throw new Error("TikTok Studio analytics import was not found")
  if (
    record.status !== "linked" &&
    Date.parse(record.expiresAt) <= Date.now()
  ) {
    const expired = {
      ...record,
      status: "expired" as const,
      updatedAt: new Date().toISOString(),
    }
    await saveImport(expired)
    return expired
  }
  return record
}

export async function ingestTikTokStudioAnalyticsCapture(input: {
  token: string
  captureId?: string
  studioUrl: string
  payload: unknown
  payloadBytes?: number
}) {
  if ((input.payloadBytes ?? 0) > MAX_CAPTURE_BYTES) {
    throw new Error("TikTok Studio analytics capture is too large")
  }
  const token = verifyCaptureToken(input.token)
  if (token.version === 3) {
    const captureId = clean(input.captureId)
    if (!captureId) throw new Error("A pending capture ID is required")
    const batch = await readBatch(captureId)
    if (batch) {
      return ingestBatchCapture(batch, input)
    }
    const record = await readImport(captureId)
    if (!record) throw new Error("Pending TikTok Studio capture was not found")
    return ingestCaptureForRecord(record, input)
  }
  if (token.version === 2) {
    const batch = await readBatch(token.captureId)
    if (!batch) throw new Error("TikTok Studio analytics batch was not found")
    return ingestBatchCapture(batch, input)
  }
  const record = await readImport(token.captureId)
  if (!record) throw new Error("TikTok Studio analytics import was not found")
  if (record.externalPostId !== token.externalPostId) {
    throw new Error("TikTok Studio analytics import does not match this post")
  }
  return ingestCaptureForRecord(record, input)
}

async function ingestBatchCapture(
  batch: TikTokStudioBatchRecord,
  input: {
    studioUrl: string
    payload: unknown
  }
) {
  const externalPostId = studioPostId(input.studioUrl)
  const imports = await readBatchImports(batch)
  const record = imports.find(
    (candidate) => candidate.externalPostId === externalPostId
  )
  if (!record) {
    throw new Error("This TikTok post is not authorized by the batch")
  }
  const result = await ingestCaptureForRecord(record, input)
  await refreshBatch(batch)
  return result
}

async function ingestCaptureForRecord(
  record: TikTokStudioImportRecord,
  input: {
    studioUrl: string
    payload: unknown
  }
) {
  assertStudioUrl(input.studioUrl, record.externalPostId)
  const parsed = parseTikTokStudioInsightPayload(input.payload)
  if (
    parsed.externalPostId &&
    parsed.externalPostId !== record.externalPostId
  ) {
    throw new Error("Captured TikTok analytics belong to a different post")
  }
  if (parsed.sections.length === 0) {
    return { import: record, accepted: false }
  }
  const capture = mergeTikTokStudioParsedCaptures(record.capture, parsed)
  const capturedSections = uniqueSections([
    ...record.capturedSections,
    ...parsed.sections,
  ])
  const updated: TikTokStudioImportRecord = {
    ...record,
    status: capturedSections.includes("overview") ? "ready" : "capturing",
    capturedSections,
    capture,
    updatedAt: new Date().toISOString(),
  }
  await saveImport(updated)
  if (!capturedSections.includes("overview")) {
    return { import: updated, accepted: true, autoLinked: false }
  }
  const linked = await linkTikTokStudioAnalyticsImport({
    importId: updated.id,
  })
  return {
    ...linked,
    accepted: true,
    autoLinked: true,
  }
}

export async function linkTikTokStudioAnalyticsImport(input: {
  importId: string
  now?: Date
}) {
  const record = await inspectTikTokStudioAnalyticsImport(input.importId)
  if (
    !record.capture?.overview ||
    !record.capturedSections.includes("overview")
  ) {
    throw new Error("Open or refresh the TikTok Studio Overview tab first")
  }
  const publication = await requireTikTokPublication(record.targetPostId)
  if (publicationExternalId(publication) !== record.externalPostId) {
    throw new Error(
      "The selected LumenClip post no longer matches this TikTok post"
    )
  }
  const canonicalReleaseUrl = canonicalTikTokPostUrl({
    externalPostId: record.externalPostId,
    authorUsername: record.capture.overview.authorUsername,
    photoCount: record.capture.overview.photoCount,
  })
  const linkedPublication =
    canonicalReleaseUrl && publication.releaseUrl !== canonicalReleaseUrl
      ? ((await patchPostFastPostRecord({
          id: publication.id,
          releaseUrl: canonicalReleaseUrl,
        })) ?? publication)
      : publication
  const now = input.now ?? new Date()
  const linkedSnapshot = record.linkedSnapshotId
    ? await getMetricSnapshot(record.linkedSnapshotId)
    : null
  const existing =
    linkedSnapshot ?? (await latestSnapshotForPost(publication.id))
  const capturedAt = linkedSnapshot?.capturedAt ?? now.toISOString()
  const snapshotId =
    linkedSnapshot?.id ?? metricSnapshotId(publication.id, capturedAt)
  const snapshot = studioCaptureToMetricSnapshot({
    id: snapshotId,
    capturedAt,
    publication: linkedPublication,
    importRecord: record,
    existing,
  })
  await upsertMetricSnapshot(snapshot)
  const linked: TikTokStudioImportRecord = {
    ...record,
    status: "linked",
    linkedSnapshotId: snapshot.id,
    updatedAt: capturedAt,
  }
  await saveImport(linked)
  return { import: linked, snapshot }
}

export function canonicalTikTokPostUrl(input: {
  externalPostId: string
  authorUsername?: string
  photoCount?: number
}) {
  const externalPostId = clean(input.externalPostId)
  const authorUsername = clean(input.authorUsername).replace(/^@+/, "")
  if (
    !/^\d+$/.test(externalPostId) ||
    !/^[A-Za-z0-9._]{2,24}$/.test(authorUsername)
  ) {
    return undefined
  }
  const postType =
    Number.isFinite(input.photoCount) && Number(input.photoCount) > 0
      ? "photo"
      : "video"
  return `https://www.tiktok.com/@${authorUsername}/${postType}/${externalPostId}`
}

export async function inspectTikTokStudioAnalyticsBatch(batchId: string) {
  const record = await readBatch(batchId)
  if (!record) throw new Error("TikTok Studio analytics batch was not found")
  return refreshBatch(record)
}

export async function linkTikTokStudioAnalyticsBatch(input: {
  batchId: string
  now?: Date
}) {
  const batch = await inspectTikTokStudioAnalyticsBatch(input.batchId)
  const ready = batch.items.filter(
    (item) => item.status === "ready" || item.status === "linked"
  )
  if (ready.length === 0) {
    throw new Error("No TikTok Studio Overview captures are ready to link")
  }
  const results = []
  for (const item of ready) {
    results.push(
      await linkTikTokStudioAnalyticsImport({
        importId: item.id,
        now: input.now,
      })
    )
  }
  const refreshed = await inspectTikTokStudioAnalyticsBatch(input.batchId)
  return { batch: refreshed, snapshots: results.map((item) => item.snapshot) }
}

export async function getTikTokStudioCaptureManifest(tokenValue: string) {
  const token = verifyCaptureToken(tokenValue)
  if (token.version === 3) {
    return getPendingDeviceCaptureManifest()
  }
  if (token.version === 1) {
    const record = await inspectTikTokStudioAnalyticsImport(token.captureId)
    if (record.externalPostId !== token.externalPostId) {
      throw new Error("TikTok Studio analytics import does not match this post")
    }
    return {
      version: 1 as const,
      captureId: record.id,
      posts: [
        {
          importId: record.id,
          postId: record.externalPostId,
          studioUrl: record.studioUrl,
        },
      ],
    }
  }
  const batch = await inspectTikTokStudioAnalyticsBatch(token.captureId)
  return {
    version: 2 as const,
    captureId: batch.id,
    posts: batch.items.map((item) => ({
      importId: item.id,
      postId: item.externalPostId,
      studioUrl: item.studioUrl,
    })),
  }
}

async function getPendingDeviceCaptureManifest() {
  const batches = await readJsonArrayStore<TikTokStudioBatchRecord>({
    rootDir,
    fileName: batchStoreFile,
    key: batchStoreKey,
    normalize: normalizeBatch,
    limit: 100,
  })
  const batchImportIds = new Set(batches.flatMap((batch) => batch.importIds))
  for (const batch of byNewest(batches)) {
    const view = await refreshBatch(batch)
    if (view.status === "complete" || view.status === "expired") continue
    return {
      version: 3 as const,
      captureId: view.id,
      captureKind: "batch" as const,
      posts: view.items.map((item) => ({
        importId: item.id,
        postId: item.externalPostId,
        studioUrl: item.studioUrl,
      })),
    }
  }

  const imports = await readJsonArrayStore<TikTokStudioImportRecord>({
    rootDir,
    fileName: storeFile,
    key: storeKey,
    normalize: normalizeImport,
    limit: 200,
  })
  const record = byNewest(imports).find(
    (item) =>
      !batchImportIds.has(item.id) &&
      item.status !== "linked" &&
      item.status !== "expired" &&
      Date.parse(item.expiresAt) > Date.now()
  )
  return {
    version: 3 as const,
    captureId: record?.id,
    captureKind: record ? ("single" as const) : undefined,
    posts: record
      ? [
          {
            importId: record.id,
            postId: record.externalPostId,
            studioUrl: record.studioUrl,
          },
        ]
      : [],
  }
}

export function encodeTikTokStudioPairingCode(input: {
  captureEndpoint: string
  captureToken: string
  importId: string
  externalPostId: string
}) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      endpoint: input.captureEndpoint,
      token: input.captureToken,
      importId: input.importId,
      postId: input.externalPostId,
    })
  ).toString("base64url")
}

export function encodeTikTokStudioBatchPairingCode(input: {
  captureEndpoint: string
  captureToken: string
  batchId: string
}) {
  return Buffer.from(
    JSON.stringify({
      version: 2,
      endpoint: input.captureEndpoint,
      token: input.captureToken,
      batchId: input.batchId,
    })
  ).toString("base64url")
}

export function parseTikTokStudioInsightPayload(
  payload: unknown
): TikTokStudioParsedCapture {
  const root = findInsightRoot(payload)
  const videoInfo = unwrapRecord(root.video_info)
  const aweme = unwrapRecord(videoInfo.aweme_info ?? videoInfo)
  const statistics = isRecord(aweme.statistics) ? aweme.statistics : {}
  const imagePostInfo = isRecord(aweme.image_post_info)
    ? aweme.image_post_info
    : {}
  const images = Array.isArray(imagePostInfo.images) ? imagePostInfo.images : []

  const views =
    metricNumber(root.realtime_total_video_views) ??
    finiteNumber(statistics.play_count)
  const likes = finiteNumber(statistics.digg_count)
  const comments = finiteNumber(statistics.comment_count)
  const shares = finiteNumber(statistics.share_count)
  const saves = finiteNumber(statistics.collect_count)
  const overview: TikTokStudioOverview = compactObject({
    authorUsername: clean(
      isRecord(aweme.author)
        ? (aweme.author.unique_id ?? aweme.author.nickname)
        : undefined
    ),
    caption: clean(aweme.desc),
    publishedAt: unixTimeIso(aweme.create_time),
    photoCount: images.length || undefined,
    views,
    likes,
    comments,
    shares,
    saves,
    totalWatchTimeSeconds: metricNumber(root.video_total_duration_realtime),
    averageWatchTimeSeconds: metricNumber(root.video_per_duration_realtime),
    fullWatchPercent: metricNumber(root.video_finish_rate_realtime),
    newFollowers:
      metricNumber(root.video_new_followers) ??
      metricNumber(root.realtime_new_followers),
  })

  const retention = indexedPercentMap(root.photo_retention_percent)
  const likeDistribution = indexedPercentMap(root.photo_like_distribution)
  const retentionDropPeak = metricNumber(root.photo_retention_drop)
  const likePeak = metricNumber(root.photo_like_peak)
  const slideIndexes = new Set([
    ...retention.keys(),
    ...likeDistribution.keys(),
    ...Array.from({ length: images.length }, (_, index) => index + 1),
  ])
  const slides = [...slideIndexes]
    .sort((left, right) => left - right)
    .map<TikTokStudioSlideMetric>((slideIndex) => ({
      slideIndex,
      retentionPercent: retention.get(slideIndex),
      likeDistributionPercent: likeDistribution.get(slideIndex),
      isRetentionDropPeak:
        retentionDropPeak !== undefined
          ? Math.round(retentionDropPeak) === slideIndex
          : undefined,
      isLikePeak:
        likePeak !== undefined
          ? Math.round(likePeak) === slideIndex
          : undefined,
    }))

  const trafficSources = namedPercentMap(
    root.video_traffic_source_percent_realtime
  )
  const searchTerms = searchTermList(root.item_search_terms)
  const audience = audienceFromRoot(root)
  const sections = uniqueSections([
    ...(Object.keys(overview).length > 0 ||
    retention.size > 0 ||
    Object.keys(trafficSources).length > 0
      ? (["overview"] as const)
      : []),
    ...(audience ? (["viewers"] as const) : []),
    ...(likeDistribution.size > 0 ||
    root.video_like_distribution_realtime !== undefined
      ? (["engagement"] as const)
      : []),
  ])

  return {
    externalPostId: clean(aweme.aweme_id) || undefined,
    sections,
    overview: Object.keys(overview).length > 0 ? overview : undefined,
    slides,
    trafficSources,
    searchTerms,
    audience,
  }
}

function studioCaptureToMetricSnapshot(input: {
  id: string
  capturedAt: string
  publication: PostFastPostRecord
  importRecord: TikTokStudioImportRecord
  existing: PostFastMetricSnapshot | null
}): PostFastMetricSnapshot {
  const capture = input.importRecord.capture!
  const overview = capture.overview ?? {}
  const rawMetrics = {
    ...(input.existing?.rawMetrics ?? {}),
    ...numericObject({
      videoViews: overview.views,
      likes: overview.likes,
      comments: overview.comments,
      shares: overview.shares,
      saves: overview.saves,
      totalWatchTimeSeconds: overview.totalWatchTimeSeconds,
      avgWatchTimeSeconds: overview.averageWatchTimeSeconds,
      full_video_watched_rate: overview.fullWatchPercent,
      newFollowers: overview.newFollowers,
      uniqueViewers: capture.audience?.uniqueViewers,
    }),
  }
  const { metrics, observedKeys } = normalizeMetricMap(rawMetrics, "tiktok")
  return {
    id: input.id,
    postId: input.publication.id,
    platformPostId: input.importRecord.externalPostId,
    integrationId: input.publication.integrationId,
    provider: "tiktok",
    capturedAt: input.capturedAt,
    publishedAt: input.publication.publishedAt ?? overview.publishedAt,
    content: input.publication.content || overview.caption,
    thumbnailUrl: input.existing?.thumbnailUrl,
    releaseUrl:
      input.publication.releaseUrl ??
      canonicalTikTokPostUrl({
        externalPostId: input.importRecord.externalPostId,
        authorUsername: overview.authorUsername,
        photoCount: overview.photoCount,
      }),
    sourceType: input.publication.sourceType,
    sourceId: input.publication.sourceId,
    contentType:
      overview.photoCount && overview.photoCount > 1
        ? "slideshow"
        : inferPostContentType({
            sourceType: input.publication.sourceType,
            media: input.publication.media,
            metrics: rawMetrics,
          }),
    mediaCount:
      overview.photoCount ??
      input.publication.media.length ??
      input.existing?.mediaCount ??
      0,
    metrics,
    latestMetric: rawMetrics,
    rawMetrics,
    observedKeys,
    source: "tiktok_studio",
    tiktokStudio: {
      schemaVersion: 1,
      studioUrl: input.importRecord.studioUrl,
      capturedSections: input.importRecord.capturedSections,
      overview: capture.overview,
      slides: capture.slides,
      trafficSources: capture.trafficSources,
      searchTerms: capture.searchTerms,
      audience: capture.audience,
    },
  }
}

export function mergeTikTokStudioParsedCaptures(
  current: TikTokStudioParsedCapture | undefined,
  incoming: TikTokStudioParsedCapture
): TikTokStudioParsedCapture {
  const bySlide = new Map<number, TikTokStudioSlideMetric>()
  for (const slide of [...(current?.slides ?? []), ...incoming.slides]) {
    bySlide.set(slide.slideIndex, {
      ...bySlide.get(slide.slideIndex),
      ...definedObject(slide),
      slideIndex: slide.slideIndex,
    })
  }
  return {
    externalPostId: incoming.externalPostId ?? current?.externalPostId,
    sections: uniqueSections([
      ...(current?.sections ?? []),
      ...incoming.sections,
    ]),
    overview: {
      ...(current?.overview ?? {}),
      ...(incoming.overview ?? {}),
    },
    slides: [...bySlide.values()].sort(
      (left, right) => left.slideIndex - right.slideIndex
    ),
    trafficSources: {
      ...(current?.trafficSources ?? {}),
      ...incoming.trafficSources,
    },
    searchTerms:
      incoming.searchTerms.length > 0
        ? incoming.searchTerms
        : (current?.searchTerms ?? []),
    audience: incoming.audience ?? current?.audience,
  }
}

function findInsightRoot(payload: unknown): Record<string, unknown> {
  const queue = [payload]
  const seen = new Set<unknown>()
  while (queue.length > 0) {
    const current = queue.shift()
    if (!isRecord(current) || seen.has(current)) continue
    seen.add(current)
    if (
      "video_info" in current ||
      "photo_retention_percent" in current ||
      "video_viewer_age_percent_realtime" in current ||
      "photo_like_distribution" in current
    ) {
      return current
    }
    for (const value of Object.values(current)) {
      if (isRecord(value)) queue.push(value)
    }
  }
  return {}
}

function unwrapRecord(value: unknown): Record<string, unknown> {
  let current = isRecord(value) ? value : {}
  for (let depth = 0; depth < 4; depth += 1) {
    if (isRecord(current.value)) {
      current = current.value
      continue
    }
    if (isRecord(current.data)) {
      current = current.data
      continue
    }
    break
  }
  return current
}

function metricNumber(value: unknown): number | undefined {
  if (Number.isFinite(Number(value))) return Number(value)
  const record = isRecord(value) ? value : {}
  for (const candidate of [
    record.value,
    isRecord(record.value) ? record.value.value : undefined,
    record.total,
  ]) {
    const numeric = finiteNumber(candidate)
    if (numeric !== undefined) return numeric
  }
  return undefined
}

function indexedPercentMap(value: unknown) {
  const record = unwrapRecord(value)
  const source = record.value ?? record
  const out = new Map<number, number>()
  if (Array.isArray(source)) {
    source.forEach((item, index) => {
      const row = isRecord(item) ? item : {}
      const slideIndex =
        finiteNumber(row.key ?? row.index ?? row.slide_index) ?? index + 1
      const numeric = metricNumber(
        isRecord(item) ? (row.value ?? row.percent) : item
      )
      if (numeric !== undefined) out.set(slideIndex, numeric)
    })
    return out
  }
  if (!isRecord(source)) return out
  for (const [key, raw] of Object.entries(source)) {
    const match = key.match(/\d+/)
    const numeric = metricNumber(raw)
    if (match && numeric !== undefined) out.set(Number(match[0]), numeric)
  }
  return out
}

function namedPercentMap(value: unknown) {
  const record = unwrapRecord(value)
  const source = record.value ?? record
  if (Array.isArray(source)) {
    return Object.fromEntries(
      source.flatMap((item) => {
        const row = isRecord(item) ? item : {}
        const key = clean(row.key ?? row.name ?? row.label)
        const numeric = metricNumber(row.value ?? row.percent ?? row.ratio)
        return key && numeric !== undefined ? [[humanizeKey(key), numeric]] : []
      })
    )
  }
  if (!isRecord(source)) return {}
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, raw]) => {
      const numeric = metricNumber(raw)
      return numeric === undefined ? [] : [[humanizeKey(key), numeric]]
    })
  )
}

function searchTermList(value: unknown): TikTokStudioSearchTerm[] {
  const record = unwrapRecord(value)
  const source = record.value ?? record
  const entries = Array.isArray(source)
    ? source
    : isRecord(source)
      ? Object.entries(source).map(([term, percent]) => ({ term, percent }))
      : []
  return entries.flatMap((item) => {
    const record = isRecord(item) ? item : {}
    const term = clean(
      record.term ??
        record.keyword ??
        record.search_term ??
        record.key ??
        record[0]
    )
    const percent = metricNumber(
      record.percent ?? record.value ?? record.ratio ?? record[1]
    )
    return term && percent !== undefined ? [{ term, percent }] : []
  })
}

function audienceFromRoot(
  root: Record<string, unknown>
): TikTokStudioAudience | undefined {
  const uniqueViewers = metricNumber(root.video_uv)
  const newViewerPercent = metricNumber(root.video_viewer_new_viewer_percent)
  const returningViewerPercent = metricNumber(
    root.video_viewer_return_viewer_percent
  )
  const followerPercent =
    metricNumber(root.video_viewer_follower_percent_realtime) ??
    metricNumber(root.video_viewer_follower_percent)
  const nonFollowerPercent =
    metricNumber(root.video_viewer_nonfollower_percent_realtime) ??
    metricNumber(root.video_viewer_non_follower_percent)
  const agePercent = namedPercentMap(root.video_viewer_age_percent_realtime)
  const genderPercent = namedPercentMap(
    root.video_viewer_gender_percent_realtime
  )
  const countryPercent = countryPercentMap(
    root.video_viewer_location_percent_realtime
  )
  if (
    uniqueViewers === undefined &&
    newViewerPercent === undefined &&
    Object.keys(agePercent).length === 0 &&
    Object.keys(genderPercent).length === 0 &&
    Object.keys(countryPercent).length === 0
  ) {
    return undefined
  }
  return {
    uniqueViewers,
    newViewerPercent,
    returningViewerPercent,
    followerPercent,
    nonFollowerPercent,
    agePercent,
    genderPercent,
    countryPercent,
  }
}

function countryPercentMap(value: unknown) {
  const record = unwrapRecord(value)
  const list = Array.isArray(record.country_percent_list)
    ? record.country_percent_list
    : Array.isArray(record.value)
      ? record.value
      : []
  return Object.fromEntries(
    list.flatMap((item) => {
      const row = isRecord(item) ? item : {}
      const country = clean(
        row.country_name ?? row.country ?? row.country_code ?? row.name
      )
      const countryPercent = metricNumber(
        row.country_vv_percent ?? row.percent ?? row.value ?? row.ratio
      )
      return country && countryPercent !== undefined
        ? [[country, countryPercent]]
        : []
    })
  )
}

function publicationExternalId(publication: PostFastPostRecord) {
  if (clean(publication.externalPostId))
    return clean(publication.externalPostId)
  if (!publication.releaseUrl) return ""
  try {
    return parseManualPublicationUrl({
      url: publication.releaseUrl,
      provider: "tiktok",
    }).externalPostId
  } catch {
    return ""
  }
}

async function requireTikTokPublication(postId: string) {
  const publication = await getPostFastPostRecord(clean(postId))
  if (!publication) throw new Error("Published LumenClip post was not found")
  if (!publication.provider.toLowerCase().startsWith("tiktok")) {
    throw new Error(
      "TikTok Studio analytics can only be linked to TikTok posts"
    )
  }
  return publication
}

async function latestSnapshotForPost(postId: string) {
  const snapshots = await listMetricSnapshots()
  return (
    snapshots
      .filter((snapshot) => snapshot.postId === postId)
      .sort(
        (left, right) =>
          Date.parse(right.capturedAt) - Date.parse(left.capturedAt)
      )[0] ?? null
  )
}

function signCaptureToken(payload: CaptureTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = crypto
    .createHmac("sha256", tokenSecret())
    .update(body)
    .digest("base64url")
  return `${body}.${signature}`
}

function verifyCaptureToken(token: string): CaptureTokenPayload {
  const [body, signature, extra] = clean(token).split(".")
  if (!body || !signature || extra) throw new Error("Invalid capture token")
  let supplied: Buffer
  try {
    supplied = Buffer.from(signature, "base64url")
  } catch {
    throw new Error("Invalid capture token")
  }
  const verified = tokenSecrets().some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(body).digest()
    return (
      expected.length === supplied.length &&
      crypto.timingSafeEqual(expected, supplied)
    )
  })
  if (!verified) {
    throw new Error("Invalid capture token")
  }
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as CaptureTokenPayload
  if (
    (payload.version !== 1 && payload.version !== 2 && payload.version !== 3) ||
    !clean(payload.ownerId) ||
    (payload.version !== 3 && !clean(payload.captureId)) ||
    (payload.version === 1 && !clean(payload.externalPostId)) ||
    (payload.version === 3 && !clean(payload.deviceId)) ||
    Date.parse(payload.expiresAt) <= Date.now()
  ) {
    throw new Error("Capture token is invalid or expired")
  }
  return payload
}

export function captureOwnerId(token: string) {
  return verifyCaptureToken(token).ownerId
}

function tokenSecret() {
  const secret = tokenSecrets()[0]
  if (!secret)
    throw new Error("TikTok Studio capture signing is not configured")
  return secret
}

function tokenSecrets() {
  return [
    clean(process.env.TIKTOK_STUDIO_CAPTURE_SECRET),
    clean(APPWRITE_API_KEY),
  ].filter((value, index, values) => value && values.indexOf(value) === index)
}

function assertStudioUrl(value: string, postId: string) {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.tiktok.com" ||
    !url.pathname.startsWith(`/tiktokstudio/analytics/${postId}/`)
  ) {
    throw new Error("Capture did not come from the expected TikTok Studio post")
  }
}

function studioPostId(value: string) {
  const url = new URL(value)
  const match = url.pathname.match(/^\/tiktokstudio\/analytics\/(\d+)\//)
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.tiktok.com" ||
    !match?.[1]
  ) {
    throw new Error("Capture did not come from a TikTok Studio analytics page")
  }
  return match[1]
}

function tiktokStudioUrl(postId: string) {
  return `https://www.tiktok.com/tiktokstudio/analytics/${postId}/overview`
}

function finiteNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function unixTimeIso(value: unknown) {
  const numeric = finiteNumber(value)
  return numeric ? new Date(numeric * 1000).toISOString() : undefined
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== ""
    )
  ) as Partial<T>
}

function numericObject(value: Record<string, number | undefined>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => Number.isFinite(item))
  ) as Record<string, number>
}

function definedObject<T extends object>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>
}

function uniqueSections(values: TikTokStudioSection[]) {
  const order: TikTokStudioSection[] = ["overview", "viewers", "engagement"]
  const supplied = new Set(values)
  return order.filter((section) => supplied.has(section))
}

function humanizeKey(value: string) {
  return value
    .replace(/_vv$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function readImport(id: string) {
  return readJsonArrayRecord<TikTokStudioImportRecord>({
    rootDir,
    fileName: storeFile,
    key: storeKey,
    id: clean(id),
    normalize: normalizeImport,
  })
}

async function saveImport(record: TikTokStudioImportRecord) {
  await upsertJsonArrayRecord<TikTokStudioImportRecord>({
    rootDir,
    fileName: storeFile,
    key: storeKey,
    record,
    position: "first",
  })
  return record
}

async function readBatch(id: string) {
  return readJsonArrayRecord<TikTokStudioBatchRecord>({
    rootDir,
    fileName: batchStoreFile,
    key: batchStoreKey,
    id: clean(id),
    normalize: normalizeBatch,
  })
}

async function saveBatch(record: TikTokStudioBatchRecord) {
  await upsertJsonArrayRecord<TikTokStudioBatchRecord>({
    rootDir,
    fileName: batchStoreFile,
    key: batchStoreKey,
    record,
    position: "first",
  })
  return record
}

async function readBatchImports(batch: TikTokStudioBatchRecord) {
  return (
    await Promise.all(batch.importIds.map((id) => readImport(id)))
  ).filter((record): record is TikTokStudioImportRecord => Boolean(record))
}

async function refreshBatch(batch: TikTokStudioBatchRecord) {
  const imports = await readBatchImports(batch)
  const view = batchView(batch, imports)
  const status =
    view.counts.linked === view.counts.total
      ? "complete"
      : Date.parse(batch.expiresAt) <= Date.now()
        ? "expired"
        : view.counts.captured === view.counts.total
          ? "ready"
          : imports.some((record) => record.capturedSections.length > 0)
            ? "capturing"
            : "waiting"
  if (status === batch.status) return { ...view, status }
  const updated: TikTokStudioBatchRecord = {
    ...batch,
    status,
    updatedAt: new Date().toISOString(),
  }
  await saveBatch(updated)
  return batchView(updated, imports)
}

function batchView(
  batch: TikTokStudioBatchRecord,
  imports: TikTokStudioImportRecord[]
): TikTokStudioBatchView {
  const items = imports.map((record) => ({
    id: record.id,
    status: record.status,
    targetPostId: record.targetPostId,
    externalPostId: record.externalPostId,
    studioUrl: record.studioUrl,
    capturedSections: record.capturedSections,
    linkedSnapshotId: record.linkedSnapshotId,
  }))
  return {
    ...batch,
    items,
    counts: {
      total: items.length,
      captured: items.filter((item) =>
        item.capturedSections.includes("overview")
      ).length,
      linked: items.filter((item) => item.status === "linked").length,
    },
  }
}

function normalizeBatch(value: TikTokStudioBatchRecord) {
  if (!value?.id || !Array.isArray(value.importIds)) return null
  return {
    ...value,
    integrationIds: Array.isArray(value.integrationIds)
      ? value.integrationIds.map(clean).filter(Boolean)
      : [],
    importIds: value.importIds.map(clean).filter(Boolean),
  }
}

function normalizeImport(value: TikTokStudioImportRecord) {
  if (!value?.id || !value.targetPostId || !value.externalPostId) return null
  return {
    ...value,
    capturedSections: uniqueSections(value.capturedSections ?? []),
  }
}

function normalizeRecentDays(value: number | undefined) {
  return Math.max(1, Math.min(365, Math.round(Number(value) || 90)))
}

function byNewest<T extends { createdAt: string }>(records: T[]) {
  return [...records].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  )
}
