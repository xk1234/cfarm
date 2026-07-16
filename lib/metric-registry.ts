import type { PostFastSocialProvider } from "@/lib/postfast-client"

export type CanonicalMetric =
  | "views"
  | "impressions"
  | "reach"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "clicks"
  | "followers"
  | "interactions"
  | "engagementRate"

export const canonicalMetricOrder: CanonicalMetric[] = [
  "views",
  "impressions",
  "reach",
  "interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "followers",
  "engagementRate",
]

const aliases: Record<string, CanonicalMetric> = {
  views: "views",
  view: "views",
  videoViews: "views",
  video_views: "views",
  playCount: "views",
  impressions: "impressions",
  impressionCount: "impressions",
  reach: "reach",
  likes: "likes",
  likeCount: "likes",
  reactions: "likes",
  comments: "comments",
  commentCount: "comments",
  replies: "comments",
  shares: "shares",
  shareCount: "shares",
  reposts: "shares",
  retweets: "shares",
  saves: "saves",
  bookmarks: "saves",
  bookmarkCount: "saves",
  clicks: "clicks",
  linkClicks: "clicks",
  followers: "followers",
  followerCount: "followers",
  totalInteractions: "interactions",
  interactions: "interactions",
  engagementRate: "engagementRate",
}

const seededCapabilities: Partial<
  Record<PostFastSocialProvider, CanonicalMetric[]>
> = {
  tiktok: ["views", "likes", "comments", "shares", "saves", "interactions"],
  instagram: [
    "views",
    "impressions",
    "reach",
    "likes",
    "comments",
    "shares",
    "saves",
    "interactions",
  ],
  facebook: [
    "views",
    "impressions",
    "reach",
    "likes",
    "comments",
    "shares",
    "clicks",
    "interactions",
  ],
  youtube: ["views", "likes", "comments", "shares", "interactions"],
  linkedin: [
    "impressions",
    "reach",
    "likes",
    "comments",
    "shares",
    "clicks",
    "interactions",
  ],
  pinterest: ["impressions", "views", "saves", "clicks", "interactions"],
  threads: ["views", "likes", "comments", "shares", "interactions"],
}

export function normalizeMetricMap(value: unknown, provider?: string) {
  const raw = isRecord(value) ? value : {}
  const metrics: Partial<Record<CanonicalMetric, number>> = {}
  const observedKeys: string[] = []
  for (const [key, rawValue] of Object.entries(raw)) {
    const metric = aliases[key]
    const numeric = Number(rawValue)
    if (!metric || !Number.isFinite(numeric)) continue
    observedKeys.push(key)
    metrics[metric] = Math.max(metrics[metric] ?? 0, numeric)
  }
  if (metrics.interactions === undefined) {
    metrics.interactions =
      (metrics.likes ?? 0) +
      (metrics.comments ?? 0) +
      (metrics.shares ?? 0) +
      (metrics.saves ?? 0)
  }
  // PostFast exposes the primary view total as `impressions` for these
  // providers. Preserve impressions while also filling the canonical view KPI.
  if (
    metrics.views === undefined &&
    metrics.impressions !== undefined &&
    ["tiktok", "instagram", "youtube"].includes(provider || "")
  ) {
    metrics.views = metrics.impressions
  }
  const denominator = metrics.views || metrics.impressions || metrics.reach
  if (denominator && denominator > 0) {
    metrics.engagementRate = ((metrics.interactions ?? 0) / denominator) * 100
  }
  return { metrics, observedKeys }
}

export function providerMetricCapabilities(
  provider: string,
  observedKeys: string[] = []
) {
  const seeded =
    seededCapabilities[provider as PostFastSocialProvider] ??
    ([] as CanonicalMetric[])
  const observed = observedKeys.flatMap((key) =>
    aliases[key] ? [aliases[key]] : []
  )
  return canonicalMetricOrder.filter(
    (metric) => seeded.includes(metric) || observed.includes(metric)
  )
}

export function providerSupportsPostAnalytics(provider: string) {
  return [
    "tiktok",
    "instagram",
    "facebook",
    "youtube",
    "linkedin",
    "pinterest",
  ].includes(provider)
}

export function metricLabel(metric: CanonicalMetric, provider?: string) {
  if (
    metric === "shares" &&
    ["x", "twitter", "threads"].includes(provider || "")
  ) {
    return "Reposts"
  }
  if (metric === "saves" && ["tiktok", "instagram"].includes(provider || "")) {
    return "Saves"
  }
  if (metric === "engagementRate") return "Engagement rate"
  return metric[0].toUpperCase() + metric.slice(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
