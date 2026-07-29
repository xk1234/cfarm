import "server-only"

import {
  engagementRate,
  type ViralBaselinePost,
} from "@/lib/viral-tracker-math"

const TIKHUB_ORIGIN = "https://api.tikhub.io"

export type TikHubProfile = {
  externalUserId?: string
  secUserId?: string
  handle: string
  displayName: string
  avatarUrl?: string
}

export type TikHubPost = ViralBaselinePost & {
  url: string
  coverUrl?: string
  mediaUrl?: string
  slideUrls: string[]
  mediaType: "video" | "slides"
}

export async function fetchTikHubProfile(
  handle: string,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {}
) {
  const normalizedHandle = normalizeTikTokHandle(handle)
  const payload = await tikhubGet(
    "/api/v1/tiktok/app/v3/handler_user_profile",
    { unique_id: normalizedHandle },
    options
  )
  return normalizeTikHubProfile(payload, normalizedHandle)
}

export async function fetchTikHubUserPosts(
  input: { handle: string; secUserId?: string; count?: number },
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {}
) {
  const payload = await tikhubGet(
    "/api/v1/tiktok/app/v3/fetch_user_post_videos",
    {
      ...(input.secUserId
        ? { sec_user_id: input.secUserId }
        : { unique_id: normalizeTikTokHandle(input.handle) }),
      max_cursor: "0",
      count: String(Math.min(20, Math.max(1, input.count ?? 10))),
      sort_type: "0",
    },
    options
  )
  return normalizeTikHubPosts(payload, normalizeTikTokHandle(input.handle))
}

export async function fetchTikHubPost(
  externalPostId: string,
  handle: string,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {}
) {
  const payload = await tikhubGet(
    "/api/v1/tiktok/app/v3/fetch_one_video",
    { aweme_id: externalPostId },
    options
  )
  const direct = normalizePost(findPostRecord(payload), handle)
  if (!direct) throw new Error("TikHub returned no TikTok post")
  return direct
}

export function normalizeTikTokHandle(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    )
    const segment = url.pathname.split("/").find((part) => part.startsWith("@"))
    if (segment) return decodeURIComponent(segment.slice(1)).trim()
  } catch {
    // Plain handles intentionally fall through.
  }
  return trimmed.replace(/^@/, "").split(/[/?#]/)[0].trim()
}

export function normalizeTikHubProfile(
  payload: unknown,
  fallbackHandle: string
): TikHubProfile {
  const record =
    findRecordWithAnyKey(payload, [
      "unique_id",
      "uniqueId",
      "sec_uid",
      "sec_user_id",
      "nickname",
    ]) ?? {}
  const handle =
    text(record.unique_id) ||
    text(record.uniqueId) ||
    text(record.username) ||
    fallbackHandle
  return {
    externalUserId:
      text(record.uid) || text(record.user_id) || text(record.id) || undefined,
    secUserId:
      text(record.sec_uid) ||
      text(record.sec_user_id) ||
      text(record.secUid) ||
      undefined,
    handle,
    displayName:
      text(record.nickname) ||
      text(record.display_name) ||
      text(record.displayName) ||
      handle,
    avatarUrl:
      firstUrl(record.avatar_larger) ||
      firstUrl(record.avatar_medium) ||
      firstUrl(record.avatar_thumb) ||
      firstUrl(record.avatar) ||
      text(record.avatar_url) ||
      undefined,
  }
}

export function normalizeTikHubPosts(
  payload: unknown,
  fallbackHandle: string
): TikHubPost[] {
  const arrays = findCandidatePostArrays(payload)
  const records = arrays
    .sort((left, right) => right.length - left.length)
    .find((items) =>
      items.some(
        (item) =>
          isRecord(item) &&
          ("aweme_id" in item || "statistics" in item || "create_time" in item)
      )
    )
  return (records ?? [])
    .map((item) => normalizePost(item, fallbackHandle))
    .filter((post): post is TikHubPost => Boolean(post))
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
    )
}

function normalizePost(
  value: unknown,
  fallbackHandle: string
): TikHubPost | null {
  if (!isRecord(value)) return null
  const post = isRecord(value.aweme_detail) ? value.aweme_detail : value
  const externalPostId =
    text(post.aweme_id) || text(post.id) || text(post.video_id)
  if (!externalPostId) return null
  const author = isRecord(post.author) ? post.author : {}
  const handle =
    text(author.unique_id) || text(author.username) || fallbackHandle
  const stats = isRecord(post.statistics)
    ? post.statistics
    : isRecord(post.stats)
      ? post.stats
      : {}
  const views = metric(stats.play_count ?? stats.playCount ?? stats.views)
  const likes = metric(stats.digg_count ?? stats.diggCount ?? stats.likes)
  const comments = metric(
    stats.comment_count ?? stats.commentCount ?? stats.comments
  )
  const shares = metric(stats.share_count ?? stats.shareCount ?? stats.shares)
  const saves = metric(
    stats.collect_count ??
      stats.collectCount ??
      stats.favoriting_count ??
      stats.saves
  )
  const slideUrls = imagePostUrls(post)
  const video = isRecord(post.video) ? post.video : {}
  const publishedAt = timestamp(post.create_time ?? post.createTime)
  return {
    externalPostId,
    caption: text(post.desc) || text(post.caption) || "Untitled TikTok",
    publishedAt,
    views,
    likes,
    comments,
    shares,
    saves,
    engagementRate: engagementRate({
      views,
      likes,
      comments,
      shares,
      saves,
    }),
    url: `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(externalPostId)}`,
    coverUrl:
      firstUrl(video.cover) ||
      firstUrl(video.origin_cover) ||
      firstUrl(video.dynamic_cover) ||
      slideUrls[0] ||
      undefined,
    mediaUrl:
      firstUrl(video.download_addr) ||
      firstUrl(video.play_addr) ||
      firstUrl(video.play_addr_h264) ||
      text(video.downloadAddr) ||
      undefined,
    slideUrls,
    mediaType: slideUrls.length > 0 ? "slides" : "video",
  }
}

async function tikhubGet(
  pathname: string,
  params: Record<string, string>,
  options: { apiKey?: string; fetchImpl?: typeof fetch }
) {
  const apiKey = options.apiKey?.trim() || process.env.TIKHUB_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      "TikHub is not configured. Add TIKHUB_API_KEY to the server environment."
    )
  }
  const url = new URL(pathname, TIKHUB_ORIGIN)
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  )
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      `TikHub request failed (${response.status}): ${providerMessage(payload)}`
    )
  }
  if (
    isRecord(payload) &&
    typeof payload.code === "number" &&
    payload.code !== 200
  ) {
    throw new Error(`TikHub request failed: ${providerMessage(payload)}`)
  }
  return payload
}

function providerMessage(payload: unknown) {
  if (!isRecord(payload)) return "Unexpected provider response"
  return (
    text(payload.message) ||
    text(payload.detail) ||
    text(payload.error) ||
    "Unexpected provider response"
  )
}

function findPostRecord(value: unknown): unknown {
  if (!isRecord(value)) return value
  if ("aweme_id" in value || "statistics" in value) return value
  for (const key of ["data", "aweme_detail", "aweme", "video"]) {
    const child = value[key]
    const match = findPostRecord(child)
    if (isRecord(match) && ("aweme_id" in match || "statistics" in match)) {
      return match
    }
  }
  return value
}

function findRecordWithAnyKey(
  value: unknown,
  keys: readonly string[],
  depth = 0
): Record<string, unknown> | null {
  if (depth > 6 || !isRecord(value)) return null
  if (keys.some((key) => key in value)) return value
  for (const child of Object.values(value)) {
    const match = findRecordWithAnyKey(child, keys, depth + 1)
    if (match) return match
  }
  return null
}

function findCandidatePostArrays(value: unknown, depth = 0): unknown[][] {
  if (depth > 6 || value == null) return []
  if (Array.isArray(value)) {
    return [
      value,
      ...value.flatMap((item) => findCandidatePostArrays(item, depth + 1)),
    ]
  }
  if (!isRecord(value)) return []
  return Object.values(value).flatMap((item) =>
    findCandidatePostArrays(item, depth + 1)
  )
}

function imagePostUrls(post: Record<string, unknown>) {
  const info = isRecord(post.image_post_info)
    ? post.image_post_info
    : isRecord(post.imagePostInfo)
      ? post.imagePostInfo
      : {}
  const images = Array.isArray(info.images) ? info.images : []
  return images
    .map((image) => {
      if (!isRecord(image)) return ""
      return (
        firstUrl(image.display_image) ||
        firstUrl(image.owner_watermark_image) ||
        firstUrl(image.thumbnail) ||
        text(image.url)
      )
    })
    .filter(Boolean)
}

function firstUrl(value: unknown): string {
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : ""
  if (Array.isArray(value)) {
    return value.map(firstUrl).find(Boolean) ?? ""
  }
  if (!isRecord(value)) return ""
  return (
    firstUrl(value.url_list) ||
    firstUrl(value.urlList) ||
    firstUrl(value.urls) ||
    firstUrl(value.url)
  )
}

function timestamp(value: unknown) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(
      numeric < 10_000_000_000 ? numeric * 1000 : numeric
    ).toISOString()
  }
  const parsed = Date.parse(text(value))
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString()
}

function metric(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
