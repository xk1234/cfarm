import { NextResponse } from "next/server"

import { getAutomationRunForSlideshow } from "@/lib/automation-runner"
import { absoluteAssetUrl } from "@/lib/asset-urls"
import { clean, isRecord } from "@/lib/guards"
import {
  providerMetricCapabilities,
  providerSupportsPostAnalytics,
} from "@/lib/metric-registry"
import {
  listFollowerSnapshots,
  listMetricSnapshots,
} from "@/lib/postfast-metric-snapshots"
import {
  normalizePostFastProvider,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import {
  listAnalyticsIntegrations,
  syncPostFastAnalytics,
} from "@/lib/postfast-analytics"
import { listPublicationRecordsForRead } from "@/lib/post-repository"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = rangeDays(searchParams.get("days"))
  const requestedIds = new Set(
    (searchParams.get("integrationIds") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )
  try {
    const [integrationResult, snapshots, followerSnapshots, publications] =
      await Promise.all([
        listAnalyticsIntegrations()
          .then((integrations) => ({ integrations, error: "" }))
          .catch((error) => ({
            integrations: [] as PostFastSocialIntegration[],
            error:
              error instanceof Error
                ? error.message
                : "Connected accounts could not be refreshed",
          })),
        listMetricSnapshots().catch(() => []),
        listFollowerSnapshots().catch(() => []),
        listPublicationRecordsForRead({
          surface: "analytics_report",
        }).catch(() => []),
      ])
    const integrations = mergeAnalyticsIntegrations(
      integrationResult.integrations,
      inferredIntegrations(snapshots, followerSnapshots, publications)
    )
    const selected =
      requestedIds.size > 0
        ? integrations.filter((item) => requestedIds.has(item.integration_id))
        : integrations
    const selectedIds = new Set(selected.map((item) => item.integration_id))
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const visibleSnapshots = snapshots.filter(
      (snapshot) =>
        selectedIds.has(snapshot.integrationId) &&
        Date.parse(snapshot.capturedAt) >= since
    )
    const visibleFollowers = followerSnapshots.filter(
      (snapshot) =>
        selectedIds.has(snapshot.integrationId) &&
        Date.parse(snapshot.capturedAt) >= since
    )
    const visiblePublications = publications.filter(
      (publication) =>
        selectedIds.has(publication.integrationId) &&
        Date.parse(
          publication.publishedAt ??
            publication.scheduledAt ??
            publication.updatedAt
        ) >= since
    )
    const capabilities = Object.fromEntries(
      selected.map((integration) => {
        const observedKeys = visibleSnapshots
          .filter(
            (snapshot) => snapshot.integrationId === integration.integration_id
          )
          .flatMap((snapshot) => snapshot.observedKeys)
        return [
          integration.integration_id,
          {
            supported: providerSupportsPostAnalytics(integration.provider),
            metrics: providerMetricCapabilities(
              integration.provider,
              observedKeys
            ),
          },
        ]
      })
    )
    const slideshowPreviews =
      await renderedSlideshowPreviews(visiblePublications)
    return NextResponse.json({
      integrations: selected,
      snapshots: visibleSnapshots,
      publications: visiblePublications,
      slideshowPreviews,
      followerSnapshots: visibleFollowers,
      capabilities,
      days,
      integrationWarning: integrationResult.error || undefined,
    })
  } catch (error) {
    return postfastRouteError(error)
  }
}

async function renderedSlideshowPreviews(
  publications: PostFastPostRecord[]
): Promise<Record<string, string[]>> {
  const recentSlideshows = [...publications]
    .filter(
      (publication) =>
        publication.sourceType === "slideshow" ||
        publication.sourceType === "automation"
    )
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt ?? right.scheduledAt ?? right.updatedAt) -
        Date.parse(left.publishedAt ?? left.scheduledAt ?? left.updatedAt)
    )
    .slice(0, 12)

  const entries = await Promise.all(
    recentSlideshows.map(async (publication) => {
      const run = await getAutomationRunForSlideshow({
        slideshowId: publication.sourceId,
        runId:
          publication.sourceType === "automation"
            ? publication.sourceId
            : undefined,
      }).catch(() => null)
      const images = (run?.outputImages ?? [])
        .map(absoluteAssetUrl)
        .filter(Boolean)
      return [publication.id, images] as const
    })
  )

  return Object.fromEntries(entries.filter(([, images]) => images.length > 0))
}

function inferredIntegrations(
  snapshots: Awaited<ReturnType<typeof listMetricSnapshots>>,
  followers: Awaited<ReturnType<typeof listFollowerSnapshots>>,
  publications: PostFastPostRecord[]
) {
  const byId = new Map<string, PostFastSocialIntegration>()
  for (const item of [...snapshots, ...followers, ...publications]) {
    const provider = normalizePostFastProvider(item.provider)
    if (!provider || byId.has(item.integrationId)) continue
    byId.set(item.integrationId, {
      integration_id: item.integrationId,
      provider,
      name: `${providerLabel(provider)} account`,
    })
  }
  return [...byId.values()]
}

function mergeAnalyticsIntegrations(
  connected: PostFastSocialIntegration[],
  inferred: PostFastSocialIntegration[]
) {
  const byId = new Map(
    connected.map((integration) => [integration.integration_id, integration])
  )
  for (const integration of inferred) {
    if (!byId.has(integration.integration_id)) {
      byId.set(integration.integration_id, integration)
    }
  }
  return [...byId.values()]
}

function providerLabel(provider: string) {
  return provider
    .replace("google-business-profile", "Google Business Profile")
    .replace(/(^|[-_])(\w)/g, (_match, prefix, letter) =>
      prefix ? ` ${String(letter).toUpperCase()}` : String(letter).toUpperCase()
    )
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const ids = new Set(
    Array.isArray(isRecord(payload) ? payload.integrationIds : null)
      ? (payload.integrationIds as unknown[]).map(clean).filter(Boolean)
      : []
  )
  const days = rangeDays(isRecord(payload) ? clean(payload.days) : null)
  try {
    const integrations = await listAnalyticsIntegrations()
    const selected =
      ids.size > 0
        ? integrations.filter((item) => ids.has(item.integration_id))
        : integrations
    const result = await syncPostFastAnalytics({ integrations: selected, days })
    return NextResponse.json(result)
  } catch (error) {
    return postfastRouteError(error)
  }
}

function rangeDays(value: string | null) {
  return Math.max(1, Math.min(365, Number(value || 30) || 30))
}
