"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { normalizeProvider } from "@/components/realfarm/analytics/account-profile-icon"
import { useAnalyticsData } from "@/components/realfarm/analytics/use-analytics-data"
import { type CanonicalMetric } from "@/lib/metric-registry"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import {
  AnalyticsHeader,
  AnalyticsOverview,
  AnalyticsSkeleton,
  AnalyticsState,
  PlatformAnalytics,
} from "@/components/realfarm/analytics/analytics-sections"
import {
  availablePlatformMetrics,
  defaultPlatformMetric,
  initialMetricForPlatform,
  latestSnapshotsByPost,
  type LatestPost,
} from "@/components/realfarm/analytics/analytics-selectors"

export type AnalyticsPayload = {
  integrations: SocialIntegration[]
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  capabilities: Record<
    string,
    { supported: boolean; metrics: CanonicalMetric[] }
  >
  days: number
  integrationWarning?: string
}

type AnalyticsViewProps = {
  previewData?: AnalyticsPayload
  initialPlatform?: string
}

export function AnalyticsView({
  previewData,
  initialPlatform,
}: AnalyticsViewProps = {}) {
  const router = useRouter()
  const [overviewAccountId, setOverviewAccountId] = useState("all")
  const [activePlatform, setActivePlatform] = useState(initialPlatform || "")
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
    initialMetricForPlatform(initialPlatform)
  )
  const [chartMode, setChartMode] = useState<"absolute" | "indexed">("absolute")
  const { data, error, isLoading, days, setDays, refreshing, refresh } =
    useAnalyticsData(previewData)
  const integrations = useMemo(
    () => data?.integrations ?? [],
    [data?.integrations]
  )
  const latestPosts = useMemo(
    () => latestSnapshotsByPost(data?.snapshots ?? []),
    [data?.snapshots]
  )
  const platformAccounts = useMemo(
    () =>
      integrations.filter(
        (integration) =>
          normalizeProvider(integration.provider) === activePlatform
      ),
    [activePlatform, integrations]
  )

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
    refresh(
      activePlatform
        ? resolvedPlatformAccountIds
        : overviewAccountId === "all"
          ? []
          : [overviewAccountId]
    )

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
        onRefresh={() => void refreshReport()}
        refreshing={refreshing}
        loading={isLoading}
      />

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
              description="Connect accounts in Settings, then sync analytics to start building history."
            />
          ) : latestPosts.length === 0 &&
            (data?.followerSnapshots.length ?? 0) === 0 ? (
            <AnalyticsState
              title="No stored analytics yet"
              description="Run Sync analytics now. Each sync appends a snapshot, so trends become more useful over time."
              action={
                <Button
                  variant="action"
                  size="compact"
                  onClick={() => void refreshReport()}
                >
                  Sync analytics
                </Button>
              }
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
              selectedAccountId={overviewAccountId}
              onSelectAccount={(id) =>
                setOverviewAccountId((current) => (current === id ? "all" : id))
              }
              onOpenPlatform={(platform) => {
                setActivePlatform(platform)
                setPlatformAccountIds(
                  integrations
                    .filter(
                      (integration) =>
                        normalizeProvider(integration.provider) === platform
                    )
                    .map((integration) => integration.integration_id)
                )
                setPlatformMetric(initialMetricForPlatform(platform))
              }}
              posts={latestPosts}
              snapshots={data?.snapshots ?? []}
              followerSnapshots={data?.followerSnapshots ?? []}
              onSelectPost={openPost}
            />
          )}
        </>
      )}
    </div>
  )
}
