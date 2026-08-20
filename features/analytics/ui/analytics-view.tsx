"use client"

// Interactive analytics surface owned by the Analytics feature.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { normalizeProvider } from "@/features/analytics/ui/account-profile-icon"
import { useAnalyticsData } from "@/features/analytics/ui/use-analytics-data"
import { type CanonicalMetric } from "@/lib/metric-registry"
import type { AnalyticsPayload } from "@/features/analytics/domain/analytics"
import {
  AnalyticsHeader,
  AnalyticsOverview,
  AnalyticsSkeleton,
  AnalyticsState,
  PlatformAnalytics,
} from "@/features/analytics/ui/analytics-sections"
import {
  availablePlatformMetrics,
  defaultPlatformMetric,
  initialMetricForPlatform,
  latestPublicationsByPost,
  type LatestPost,
} from "@/features/analytics/ui/analytics-selectors"
import { TikTokStudioBatchDialog } from "@/features/analytics/ui/tiktok-studio-batch-dialog"

export type { AnalyticsPayload } from "@/features/analytics/domain/analytics"

type AnalyticsViewProps = {
  previewData?: AnalyticsPayload
  initialPlatform?: string
  companionIntent?: "tiktok-studio"
}

export function AnalyticsView({
  previewData,
  initialPlatform,
  companionIntent,
}: AnalyticsViewProps = {}) {
  const router = useRouter()
  const [activePlatform, setActivePlatform] = useState(
    initialPlatform || (companionIntent === "tiktok-studio" ? "tiktok" : "")
  )
  const [platformAccountIds, setPlatformAccountIds] = useState<string[]>(() =>
    previewData && initialPlatform
      ? previewData.integrations
          .filter(
            (integration) =>
              normalizeProvider(integration.provider) === initialPlatform
          )
          .map((integration) => integration.integration_id)
      : []
  )
  const [platformMetric, setPlatformMetric] = useState<CanonicalMetric>(() =>
    initialMetricForPlatform(
      initialPlatform || (companionIntent === "tiktok-studio" ? "tiktok" : "")
    )
  )
  const [chartMode, setChartMode] = useState<"absolute" | "indexed">("absolute")
  const [showTikTokStudioSync, setShowTikTokStudioSync] = useState(
    companionIntent === "tiktok-studio"
  )
  const { data, error, isLoading, days, setDays, refresh } =
    useAnalyticsData(previewData)
  const integrations = useMemo(
    () => data?.integrations ?? [],
    [data?.integrations]
  )
  const latestPosts = useMemo(
    () =>
      latestPublicationsByPost(data?.publications ?? [], data?.snapshots ?? []),
    [data?.publications, data?.snapshots]
  )
  const platformAccounts = useMemo(
    () =>
      integrations.filter(
        (integration) =>
          normalizeProvider(integration.provider) === activePlatform
      ),
    [activePlatform, integrations]
  )

  const companionNotice = useMemo(() => {
    if (!companionIntent || isLoading || !data) return ""
    return integrations.some(
      (integration) => normalizeProvider(integration.provider) === "tiktok"
    )
      ? ""
      : "Connect a TikTok account in Settings before importing TikTok Studio analytics."
  }, [companionIntent, data, integrations, isLoading])

  const resolvedPlatformAccountIds = useMemo(() => {
    const available = new Set(
      platformAccounts.map((account) => account.integration_id)
    )
    const valid = platformAccountIds.filter((id) => available.has(id))
    return valid.length
      ? valid
      : platformAccounts.map((account) => account.integration_id)
  }, [platformAccountIds, platformAccounts])

  const platformMetrics = useMemo(
    () =>
      availablePlatformMetrics({
        accounts: platformAccounts,
        capabilities: data?.capabilities ?? {},
        snapshots: data?.snapshots ?? [],
        followers: data?.followerSnapshots ?? [],
        selectedIds: resolvedPlatformAccountIds,
      }),
    [
      data?.capabilities,
      data?.followerSnapshots,
      data?.snapshots,
      resolvedPlatformAccountIds,
      platformAccounts,
    ]
  )
  const resolvedPlatformMetric = platformMetrics.includes(platformMetric)
    ? platformMetric
    : defaultPlatformMetric(activePlatform, platformMetrics)

  const refreshReport = () =>
    refresh(activePlatform ? resolvedPlatformAccountIds : [])

  const showingPlatform = Boolean(activePlatform && platformAccounts.length)
  const openPost = (post: LatestPost) =>
    router.push(`/app/analytics/posts/${encodeURIComponent(post.postId)}`)

  return (
    <div className="mx-auto max-w-[1380px] pb-14">
      <AnalyticsHeader
        platform={showingPlatform ? activePlatform : ""}
        days={days}
        onDaysChange={setDays}
        onBack={() => setActivePlatform("")}
      />

      {companionNotice ? (
        <div
          role="alert"
          className="mb-5 rounded-[10px] border border-app-warning/25 bg-app-warning-surface px-4 py-3 text-[12px] leading-5 font-semibold text-app-warning"
        >
          {companionNotice}
        </div>
      ) : null}

      {data?.integrationWarning ? (
        <div className="mb-5 rounded-[10px] bg-app-warning-surface px-4 py-3 text-[12px] font-semibold text-app-warning">
          Showing stored analytics. Connected accounts could not be refreshed
          from PostFast right now.
        </div>
      ) : null}

      {error && !data ? (
        <AnalyticsState
          title="Analytics could not be loaded"
          description={
            error instanceof Error ? error.message : "Try syncing again."
          }
        />
      ) : isLoading && !data ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          {error && data ? (
            <div className="mb-5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-900">
              Showing the last loaded analytics. Refresh failed.
            </div>
          ) : null}
          {integrations.length === 0 ? (
            <AnalyticsState
              title="No connected social accounts"
              description="Connect accounts in Settings. PostFast analytics will begin refreshing automatically."
            />
          ) : latestPosts.length === 0 &&
            (data?.followerSnapshots.length ?? 0) === 0 ? (
            <AnalyticsState
              title="No stored analytics yet"
              description="PostFast metrics will appear after the automatic account refresh completes. Later snapshots will build trends over time."
            />
          ) : showingPlatform ? (
            <PlatformAnalytics
              platform={activePlatform}
              accounts={platformAccounts}
              selectedIds={resolvedPlatformAccountIds}
              onSelectedIdsChange={setPlatformAccountIds}
              metrics={platformMetrics}
              metric={resolvedPlatformMetric}
              onMetricChange={setPlatformMetric}
              chartMode={chartMode}
              onChartModeChange={setChartMode}
              snapshots={data?.snapshots ?? []}
              followerSnapshots={data?.followerSnapshots ?? []}
              posts={latestPosts}
              capabilities={data?.capabilities ?? {}}
              onSelectPost={openPost}
            />
          ) : (
            <AnalyticsOverview
              integrations={integrations}
              posts={latestPosts}
              snapshots={data?.snapshots ?? []}
              followerSnapshots={data?.followerSnapshots ?? []}
              slideshowPreviews={data?.slideshowPreviews ?? {}}
              onSelectPost={openPost}
            />
          )}
        </>
      )}
      {showTikTokStudioSync && !isLoading && platformAccounts.length ? (
        <TikTokStudioBatchDialog
          accounts={platformAccounts.filter((account) =>
            resolvedPlatformAccountIds.includes(account.integration_id)
          )}
          autoStart={companionIntent === "tiktok-studio"}
          onClose={() => setShowTikTokStudioSync(false)}
          onLinked={() => void refreshReport()}
        />
      ) : null}
    </div>
  )
}
