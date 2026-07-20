import { NextResponse } from "next/server"

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
    const [integrationResult, snapshots, followerSnapshots] = await Promise.all([
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
      ])
    const integrations =
      integrationResult.integrations.length > 0
        ? integrationResult.integrations
        : inferredIntegrations(snapshots, followerSnapshots)
    const selected =
      requestedIds.size > 0
        ? integrations.filter((item) => requestedIds.has(item.integration_id))
        : integrations
    const selectedIds = new Set(selected.map((item) => item.integration_id))
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const visibleSnapshots = snapshots
      .filter(
        (snapshot) =>
          selectedIds.has(snapshot.integrationId) &&
          Date.parse(snapshot.capturedAt) >= since
      )
    const visibleFollowers = followerSnapshots.filter(
      (snapshot) =>
        selectedIds.has(snapshot.integrationId) &&
        Date.parse(snapshot.capturedAt) >= since
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
    return NextResponse.json({
      integrations: selected,
      snapshots: visibleSnapshots,
      followerSnapshots: visibleFollowers,
      capabilities,
      days,
      integrationWarning: integrationResult.error || undefined,
    })
  } catch (error) {
    return postfastRouteError(error)
  }
}

function inferredIntegrations(
  snapshots: Awaited<ReturnType<typeof listMetricSnapshots>>,
  followers: Awaited<ReturnType<typeof listFollowerSnapshots>>
) {
  const byId = new Map<string, PostFastSocialIntegration>()
  for (const item of [...snapshots, ...followers]) {
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
