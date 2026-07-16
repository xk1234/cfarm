import { clean, isRecord } from "@/lib/guards"
import { normalizeMetricMap } from "@/lib/metric-registry"
import {
  normalizePostFastIntegration,
  postfastRequest,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import {
  appendFollowerSnapshots,
  appendMetricSnapshots,
  type AccountFollowerSnapshot,
  type PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import { listPostFastPostRecords } from "@/lib/postfast-posts"

export async function listAnalyticsIntegrations() {
  const payload = await postfastRequest<unknown[]>(
    "/social-media/my-social-accounts"
  )
  return payload.flatMap((item) => {
    const integration = normalizePostFastIntegration(item)
    return integration && !integration.disabled ? [integration] : []
  })
}

export async function syncPostFastAnalytics(input: {
  integrations?: PostFastSocialIntegration[]
  days?: number
  capturedAt?: Date
}) {
  const integrations = input.integrations ?? (await listAnalyticsIntegrations())
  const days = Math.max(1, Math.min(365, input.days ?? 30))
  const endDate = input.capturedAt ?? new Date()
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
  const localPosts = await listPostFastPostRecords().catch(() => [])
  const localByRemoteId = new Map<string, (typeof localPosts)[number]>()
  for (const post of localPosts) {
    for (const id of [post.postfastPostId, post.externalPostId]) {
      if (id) localByRemoteId.set(id, post)
    }
  }
  const capturedAt = endDate.toISOString()
  const metricSnapshots: Omit<PostFastMetricSnapshot, "id">[] = []
  const followerSnapshots: Omit<AccountFollowerSnapshot, "id">[] = []
  const errors: Array<{ integrationId: string; error: string }> = []

  for (const integration of integrations) {
    try {
      const payload = await postfastRequest("/social-posts/analytics", {
        query: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          socialMediaIds: integration.integration_id,
        },
      })
      const posts = analyticsPosts(payload)
      for (const value of posts) {
        const post = isRecord(value) ? value : {}
        const remotePostId = clean(post.id || post.postId)
        const platformPostId = clean(post.platformPostId || post.externalPostId)
        const local =
          localByRemoteId.get(remotePostId) ??
          localByRemoteId.get(platformPostId)
        // Locally-published posts keep their durable local id. Remote-only
        // posts use the platform-native id so they remain first-class series
        // instead of being counted and discarded.
        const postId = local?.id || platformPostId || remotePostId
        if (!postId) continue
        const latestMetric = isRecord(post.latestMetric)
          ? post.latestMetric
          : {}
        const rawMetric = {
          ...numericRecord(latestMetric),
          ...numericRecord(latestMetric.extras),
        }
        const { metrics, observedKeys } = normalizeMetricMap(
          rawMetric,
          integration.provider
        )
        metricSnapshots.push({
          postId,
          platformPostId: platformPostId || undefined,
          integrationId: integration.integration_id,
          provider: integration.provider,
          capturedAt,
          publishedAt: clean(post.publishedAt) || undefined,
          content:
            clean(post.content || post.text || post.caption) || local?.content,
          thumbnailUrl: firstMediaUrl(post),
          releaseUrl:
            clean(post.releaseURL || post.releaseUrl) || local?.releaseUrl,
          sourceType: local?.sourceType || "external",
          sourceId: local?.sourceId,
          metrics,
          latestMetric,
          rawMetrics: rawMetric,
          observedKeys,
        })
      }
    } catch (error) {
      errors.push({
        integrationId: integration.integration_id,
        error: error instanceof Error ? error.message : "Analytics sync failed",
      })
    }

    try {
      const followerPayload = await postfastRequest(
        `/social-media/${encodeURIComponent(integration.integration_id)}/follower-history`
      )
      followerSnapshots.push(
        ...normalizeFollowerHistory(followerPayload, integration, capturedAt)
      )
    } catch {
      // Follower history is not available for every provider/account type.
    }
  }

  const [storedMetrics, storedFollowers] = await Promise.all([
    appendMetricSnapshots(metricSnapshots),
    appendFollowerSnapshots(followerSnapshots),
  ])
  return {
    integrations,
    metricSnapshots: storedMetrics.length,
    followerSnapshots: storedFollowers.length,
    errors,
  }
}

function analyticsPosts(value: unknown) {
  const record = isRecord(value) ? value : {}
  return Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.posts)
      ? record.posts
      : Array.isArray(value)
        ? value
        : []
}

function numericRecord(value: unknown) {
  const record = isRecord(value) ? value : {}
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, raw]) => {
      const numeric = Number(raw)
      return Number.isFinite(numeric) ? [[key, numeric]] : []
    })
  )
}

function firstMediaUrl(post: Record<string, unknown>) {
  const media = Array.isArray(post.mediaItems)
    ? post.mediaItems
    : Array.isArray(post.media)
      ? post.media
      : []
  const first = isRecord(media[0]) ? media[0] : {}
  return (
    clean(first.url || first.thumbnailUrl || post.thumbnailUrl) || undefined
  )
}

function normalizeFollowerHistory(
  payload: unknown,
  integration: PostFastSocialIntegration,
  fallbackCapturedAt: string
) {
  const record = isRecord(payload) ? payload : {}
  const points = Array.isArray(record.series)
    ? record.series
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.history)
        ? record.history
        : Array.isArray(payload)
          ? payload
          : []
  return points.flatMap<Omit<AccountFollowerSnapshot, "id">>((value) => {
    const point = isRecord(value) ? value : {}
    const followers = Number(
      point.followers || point.followerCount || point.total || point.value
    )
    if (!Number.isFinite(followers)) return []
    return [
      {
        integrationId: integration.integration_id,
        provider: integration.provider,
        capturedAt:
          clean(point.capturedAt || point.date || point.createdAt) ||
          fallbackCapturedAt,
        followers,
        netChange: Number.isFinite(Number(point.netChange))
          ? Number(point.netChange)
          : undefined,
      },
    ]
  })
}
