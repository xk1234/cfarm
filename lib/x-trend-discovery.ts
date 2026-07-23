import { clean, isRecord } from "@/lib/guards"
import type {
  XAutomationRecord,
  XDiscoverySource,
  XTrendCandidate,
} from "@/lib/x-automation"

type FetchLike = typeof fetch

const defaultActors: Record<XDiscoverySource, string> = {
  x: "apidojo~twitter-scraper-lite",
  tiktok: "clockworks~tiktok-scraper",
  instagram: "apify~instagram-scraper",
}

export async function discoverTrendCandidates(input: {
  automation: XAutomationRecord
  query?: string
  source?: XDiscoverySource
  token?: string
  fetchImpl?: FetchLike
}) {
  const token = clean(input.token) || clean(process.env.APIFY_KEY)
  if (!token) throw new Error("APIFY_KEY is not configured")
  const sources = input.source
    ? [input.source]
    : input.automation.discovery.sources
  const query =
    clean(input.query) ||
    input.automation.brief?.keywords.join(" OR ") ||
    input.automation.niche.label
  const results = await Promise.allSettled(
    sources.map((source) =>
      runActor({
        source,
        query,
        token,
        fetchImpl: input.fetchImpl,
        lookbackHours: input.automation.discovery.lookbackHours,
      })
    )
  )
  const groups = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  )
  if (groups.length === 0) {
    const reason = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )?.reason
    throw reason instanceof Error
      ? reason
      : new Error("All trend sources failed")
  }
  return groups
    .flat()
    .filter(
      (candidate) =>
        candidate.metrics.views >= input.automation.discovery.minimumViews &&
        candidate.engagementRate >=
          input.automation.discovery.minimumEngagementRate
    )
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore || b.metrics.views - a.metrics.views
    )
    .slice(0, 30)
}

async function runActor(input: {
  source: XDiscoverySource
  query: string
  token: string
  lookbackHours: number
  fetchImpl?: FetchLike
}) {
  const actor = actorFor(input.source)
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(input.token)}&format=json&clean=true`
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(actorInput(input.source, input.query)),
    signal: AbortSignal.timeout(45_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error)
        ? clean(payload.error.message)
        : ""
    throw new Error(
      message || `Apify ${input.source} discovery failed (${response.status})`
    )
  }
  const rows = Array.isArray(payload) ? payload : []
  return rows.flatMap((row, index) => {
    const candidate = normalizeCandidate(input.source, row, index, input.query)
    if (!candidate) return []
    if (candidate.publishedAt) {
      const age = Date.now() - Date.parse(candidate.publishedAt)
      if (Number.isFinite(age) && age > input.lookbackHours * 60 * 60 * 1000)
        return []
    }
    return [candidate]
  })
}

export function normalizeCandidate(
  source: XDiscoverySource,
  value: unknown,
  index = 0,
  query = ""
): XTrendCandidate | null {
  if (!isRecord(value)) return null
  const text = clean(
    value.text ??
      value.fullText ??
      value.caption ??
      value.description ??
      value.title
  )
  const url = clean(
    value.url ??
      value.postUrl ??
      value.tweetUrl ??
      value.webVideoUrl ??
      value.inputUrl
  )
  if (!text || !url) return null
  const views = numberValue(
    value.viewCount ?? value.views ?? value.playCount ?? value.videoPlayCount
  )
  const likes = numberValue(
    value.likeCount ?? value.likes ?? value.favoriteCount ?? value.diggCount
  )
  const replies = numberValue(
    value.replyCount ??
      value.replies ??
      value.commentCount ??
      value.commentsCount
  )
  const reposts = numberValue(
    value.retweetCount ?? value.reposts ?? value.shareCount ?? value.shares
  )
  const denominator = Math.max(1, views)
  const engagementRate = (likes + replies + reposts) / denominator
  const queryTokens = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2)
  )
  const normalizedText = text.toLowerCase()
  const overlap = [...queryTokens].filter((token) =>
    normalizedText.includes(token)
  ).length
  const relevanceScore = Math.round(
    Math.min(
      100,
      35 +
        overlap * 12 +
        Math.log10(Math.max(10, views)) * 7 +
        Math.min(20, engagementRate * 200)
    )
  )
  return {
    id:
      clean(value.id ?? value.tweetId ?? value.shortCode ?? value.videoId) ||
      `${source}-${index}-${hash(url)}`,
    source,
    url,
    author:
      clean(
        value.authorName ??
          value.author ??
          value.ownerUsername ??
          value.username
      ) || undefined,
    text,
    mediaUrls: mediaUrls(value),
    publishedAt:
      clean(
        value.createdAt ??
          value.timestamp ??
          value.takenAt ??
          value.createTimeISO
      ) || undefined,
    metrics: { views, likes, replies, reposts },
    engagementRate,
    relevanceScore,
    reason: `${views.toLocaleString()} views · ${(engagementRate * 100).toFixed(1)}% engagement · ${overlap} niche term match${overlap === 1 ? "" : "es"}`,
  }
}

function actorFor(source: XDiscoverySource) {
  const env =
    source === "x"
      ? process.env.APIFY_TWITTER_ACTOR
      : source === "tiktok"
        ? process.env.APIFY_TIKTOK_ACTOR
        : process.env.APIFY_INSTAGRAM_ACTOR
  return clean(env)?.replace("/", "~") || defaultActors[source]
}

function actorInput(source: XDiscoverySource, query: string) {
  if (source === "x")
    return { searchTerms: [query], maxItems: 40, sort: "Latest + Top" }
  if (source === "tiktok")
    return {
      searchQueries: [query],
      resultsPerPage: 30,
      shouldDownloadVideos: false,
    }
  return {
    search: query,
    searchType: "hashtag",
    resultsType: "posts",
    resultsLimit: 30,
  }
}

function mediaUrls(value: Record<string, unknown>) {
  const arrays = [
    value.images,
    value.photos,
    value.media,
    value.displayResources,
  ]
  const urls = arrays
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .flatMap((item) => {
      if (typeof item === "string") return [item]
      if (!isRecord(item)) return []
      const url = clean(
        item.url ?? item.src ?? item.displayUrl ?? item.mediaUrl
      )
      return url ? [url] : []
    })
  const direct = clean(
    value.imageUrl ?? value.thumbnailUrl ?? value.displayUrl ?? value.videoUrl
  )
  return [...new Set([direct, ...urls].filter(Boolean))]
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index += 1)
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  return result.toString(36)
}
