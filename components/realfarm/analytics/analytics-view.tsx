"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { DateTime } from "luxon"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconArrowDownRight,
  IconArrowLeft,
  IconArrowUpRight,
  IconChartBar,
  IconRefresh,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import {
  AccountProfileIcon,
  normalizeProvider,
  providerName,
} from "@/components/realfarm/analytics/account-profile-icon"
import { PaginationControls } from "@/components/realfarm/analytics/pagination-controls"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"
import {
  canonicalMetricOrder,
  metricLabel,
  type CanonicalMetric,
} from "@/lib/metric-registry"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import {
  inferPostContentType,
  postContentTypeLabel,
} from "@/lib/post-content-type"
import { cn } from "@/lib/utils"

export type AnalyticsPayload = {
  integrations: PostFastSocialIntegration[]
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  capabilities: Record<
    string,
    { supported: boolean; metrics: CanonicalMetric[] }
  >
  days: number
  integrationWarning?: string
}

type LatestPost = PostFastMetricSnapshot & {
  previous?: PostFastMetricSnapshot
}

type AnalyticsViewProps = {
  previewData?: AnalyticsPayload
  initialPlatform?: string
}

const seriesColors = [
  "#6d28d9",
  "#d43791",
  "#d97706",
  "#167d61",
  "#2e69ad",
  "#7c5b3f",
  "#755da8",
  "#49707a",
]

export function AnalyticsView({
  previewData,
  initialPlatform,
}: AnalyticsViewProps = {}) {
  const router = useRouter()
  const [days, setDays] = useState(previewData?.days ?? 30)
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
  const [refreshing, setRefreshing] = useState(false)
  const requestKey = `/api/analytics/report?days=${days}`
  const { data, error, isLoading, mutate } = useSWR<AnalyticsPayload>(
    previewData ? null : requestKey,
    clientSWRFetcher,
    { keepPreviousData: true, fallbackData: previewData }
  )
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

  async function refresh() {
    if (previewData) return
    setRefreshing(true)
    try {
      await fetchJsonWithTimeout("/api/analytics/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days,
          integrationIds: activePlatform
            ? resolvedPlatformAccountIds
            : overviewAccountId === "all"
              ? []
              : [overviewAccountId],
        }),
        timeoutMs: 120_000,
      })
      await mutate()
    } finally {
      setRefreshing(false)
    }
  }

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
        onRefresh={() => void refresh()}
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
                  onClick={() => void refresh()}
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

function AnalyticsHeader({
  platform,
  days,
  onDaysChange,
  onBack,
  onRefresh,
  refreshing,
  loading,
}: {
  platform: string
  days: number
  onDaysChange: (days: number) => void
  onBack: () => void
  onRefresh: () => void
  refreshing: boolean
  loading: boolean
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        {platform ? (
          <button
            type="button"
            onClick={onBack}
            className="lc-focus-ring mb-3 inline-flex items-center gap-1.5 rounded-[7px] text-[12px] font-semibold text-app-muted-text transition hover:text-app-text"
          >
            <IconArrowLeft className="size-4" /> Back to overview
          </button>
        ) : (
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-app-muted-text">
            <IconChartBar className="size-4" /> Cross-platform reporting
          </div>
        )}
        <h1 className="text-[30px] leading-none font-semibold tracking-[-0.04em] text-app-text">
          {platform ? `${providerName(platform)} analytics` : "Analytics"}
        </h1>
        <p className="mt-3 max-w-[650px] text-[14px] leading-6 font-medium text-app-muted-text">
          {platform
            ? `Compare connected ${providerName(platform)} accounts using the metrics PostFast actually reports.`
            : "See audience, distribution, engagement, recent posts, and account health in one view."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <SelectControl
          aria-label="Analytics date range"
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
        >
          {[7, 30, 60, 90].map((value) => (
            <option key={value} value={value}>
              {value} days
            </option>
          ))}
        </SelectControl>
        <Button
          variant="softControl"
          size="compact"
          onClick={onRefresh}
          disabled={refreshing || loading}
        >
          <IconRefresh className={cn("size-4", refreshing && "animate-spin")} />
          Sync analytics
        </Button>
      </div>
    </header>
  )
}

function AnalyticsOverview({
  integrations,
  selectedAccountId,
  onSelectAccount,
  onOpenPlatform,
  posts,
  snapshots,
  followerSnapshots,
  onSelectPost,
}: {
  integrations: PostFastSocialIntegration[]
  selectedAccountId: string
  onSelectAccount: (id: string) => void
  onOpenPlatform: (platform: string) => void
  posts: LatestPost[]
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  onSelectPost: (post: LatestPost) => void
}) {
  const selectedIds =
    selectedAccountId === "all"
      ? integrations.map((item) => item.integration_id)
      : [selectedAccountId]
  const selectedSet = new Set(selectedIds)
  const visiblePosts = posts.filter((post) =>
    selectedSet.has(post.integrationId)
  )
  const visibleSnapshots = snapshots.filter((snapshot) =>
    selectedSet.has(snapshot.integrationId)
  )
  const visibleFollowers = followerSnapshots.filter((snapshot) =>
    selectedSet.has(snapshot.integrationId)
  )
  const recent = [...visiblePosts].sort(
    (a, b) => postTimestamp(b) - postTimestamp(a)
  )

  return (
    <div className="space-y-8">
      <AccountSelectorRail
        integrations={integrations}
        selectedIds={selectedIds}
        allSelected={selectedAccountId === "all"}
        multi={false}
        onToggle={onSelectAccount}
        onSelectAll={() => {
          if (selectedAccountId !== "all") onSelectAccount(selectedAccountId)
        }}
      />

      <section className="grid gap-3 lg:grid-cols-3">
        <PortfolioMetricCard
          label="Total audience"
          value={latestFollowerTotal(visibleFollowers, selectedIds)}
          series={audienceSeries(visibleFollowers, selectedIds)}
          color="#6d28d9"
          availability={accountCoverageLabel(
            visibleFollowers.map((point) => point.integrationId),
            selectedIds.length
          )}
        />
        <PortfolioMetricCard
          label="Total impressions"
          value={metricAggregate(visiblePosts, "impressions")}
          series={postMetricSeries(visibleSnapshots, "impressions")}
          color="#d43791"
          availability={postCoverageLabel(visiblePosts, "impressions")}
        />
        <PortfolioMetricCard
          label="Total engagement"
          value={metricAggregate(visiblePosts, "interactions")}
          series={postMetricSeries(visibleSnapshots, "interactions")}
          color="#d97706"
          availability={postCoverageLabel(visiblePosts, "interactions")}
        />
      </section>

      <RecentPosts
        title="Recent posts across platforms"
        description="The newest posts from the selected accounts, mixed into one timeline."
        posts={recent}
        integrations={integrations}
        onSelect={onSelectPost}
      />

      <AccountPerformanceTable
        integrations={integrations}
        posts={posts}
        followers={followerSnapshots}
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
        onOpenPlatform={onOpenPlatform}
      />
    </div>
  )
}

function AccountSelectorRail({
  integrations,
  selectedIds,
  allSelected,
  multi,
  onToggle,
  onSelectAll,
}: {
  integrations: PostFastSocialIntegration[]
  selectedIds: string[]
  allSelected?: boolean
  multi: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
}) {
  const selected = new Set(selectedIds)
  return (
    <section aria-label={multi ? "Compare accounts" : "Filter by account"}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-app-text">
            {multi ? "Accounts" : "Connected accounts"}
          </h2>
          <p className="mt-0.5 text-[11px] font-medium text-app-muted-text">
            {multi
              ? `${selectedIds.length} of ${integrations.length} selected`
              : "Choose an account or keep the combined portfolio view."}
          </p>
        </div>
        {multi ? (
          <button
            type="button"
            onClick={onSelectAll}
            className="lc-focus-ring rounded-[7px] px-2 py-1 text-[11px] font-semibold text-app-muted-text transition hover:bg-app-control-hover hover:text-app-text"
          >
            {selectedIds.length === integrations.length
              ? "Keep one"
              : "Select all"}
          </button>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {!multi ? (
          <button
            type="button"
            aria-pressed={Boolean(allSelected)}
            aria-label="All accounts, portfolio"
            title="All accounts · Portfolio"
            onClick={onSelectAll}
            className={cn(
              "lc-focus-ring grid size-[54px] shrink-0 place-items-center rounded-[13px] border transition active:translate-y-px",
              allSelected
                ? "border-[#a98be2] bg-[#f4efff] shadow-[0_5px_18px_rgba(71,38,120,0.09)]"
                : "border-app-panel-border bg-app-surface hover:bg-app-surface-subtle"
            )}
          >
            <span className="grid size-9 place-items-center rounded-full bg-app-strong text-white">
              <IconWorld className="size-4" />
            </span>
          </button>
        ) : null}
        {integrations.map((integration) => {
          const active = selected.has(integration.integration_id)
          return (
            <button
              key={integration.integration_id}
              type="button"
              aria-pressed={active}
              aria-label={`${active ? "Remove" : "Add"} ${integration.name}, ${providerName(integration.provider)}`}
              onClick={() => onToggle(integration.integration_id)}
              className={cn(
                "lc-focus-ring grid size-[54px] shrink-0 place-items-center rounded-[13px] border transition active:translate-y-px",
                active
                  ? "border-[#a98be2] bg-[#f4efff] shadow-[0_5px_18px_rgba(71,38,120,0.09)]"
                  : "border-app-panel-border bg-app-surface hover:bg-app-surface-subtle"
              )}
            >
              <AccountProfileIcon
                integration={integration}
                size="md"
                selected={multi && active}
                tooltip
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}

function PortfolioMetricCard({
  label,
  value,
  series,
  color,
  availability,
}: {
  label: string
  value: number | undefined
  series: Array<{ date: string; label: string; value: number }>
  color: string
  availability: string
}) {
  const delta = seriesDelta(series)
  const gradientId = `metric-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`
  return (
    <article className="overflow-hidden rounded-[16px] border border-app-panel-border bg-app-surface px-5 pt-5 shadow-[0_12px_35px_rgba(35,24,67,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold text-app-muted-text">
            {label}
          </div>
          <div className="mt-2 text-[30px] leading-none font-semibold tracking-[-0.04em] text-app-text tabular-nums">
            {value === undefined ? "—" : formatAnalyticsNumber(value)}
          </div>
        </div>
        {delta !== null ? <DeltaLabel delta={delta} /> : null}
      </div>
      <div className="mt-2 text-[10px] font-medium text-app-text-faint">
        {availability}
      </div>
      <div className="mt-3 h-[112px]">
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 8, right: 1, bottom: 0, left: 1 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip content={<CompactTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.25}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center rounded-t-[10px] bg-app-surface-subtle text-center text-[10px] font-medium text-app-text-faint">
            Sync again to build a trend
          </div>
        )}
      </div>
    </article>
  )
}

function RecentPosts({
  title,
  description,
  posts,
  integrations,
  metric,
  onSelect,
}: {
  title: string
  description: string
  posts: LatestPost[]
  integrations: PostFastSocialIntegration[]
  metric?: CanonicalMetric
  onSelect: (post: LatestPost) => void
}) {
  const [page, setPage] = useState(0)
  const pageSize = 4
  const pageCount = Math.max(1, Math.ceil(posts.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visiblePosts = posts.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  )
  const accounts = new Map(
    integrations.map((item) => [item.integration_id, item])
  )
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <SectionHeading title={title} description={description} />
        <PaginationControls
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          label="recent posts"
        />
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {visiblePosts.map((post) => {
          const account =
            accounts.get(post.integrationId) ?? fallbackIntegration(post)
          const primaryMetric =
            metric && metric !== "followers"
              ? metric
              : post.metrics.impressions !== undefined
                ? "impressions"
                : "views"
          return (
            <button
              key={`${post.integrationId}:${post.postId}`}
              type="button"
              onClick={() => onSelect(post)}
              className="lc-focus-ring group min-w-[220px] flex-1 basis-0 overflow-hidden rounded-[14px] border border-app-panel-border bg-app-surface text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(35,24,67,0.09)] active:translate-y-0"
            >
              <PostThumbnail post={post} />
              <span className="block p-3.5">
                <span className="flex items-center justify-between gap-2">
                  <AccountProfileIcon integration={account} size="sm" tooltip />
                  <span className="text-[9px] font-medium text-app-text-faint">
                    {formatPostDate(post)}
                  </span>
                </span>
                <span className="mt-3 line-clamp-2 min-h-9 text-[12px] leading-[18px] font-semibold text-app-text">
                  {post.content || "Untitled post"}
                </span>
                <span className="mt-3 flex items-end justify-between gap-3 border-t border-[#eeedf3] pt-2.5">
                  <span>
                    <span className="block text-[9px] font-medium text-app-text-faint">
                      {metricLabel(primaryMetric, post.provider)}
                    </span>
                    <span className="mt-0.5 block text-[13px] font-semibold text-app-text tabular-nums">
                      {formatMetric(primaryMetric, post.metrics[primaryMetric])}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[9px] font-medium text-app-text-faint">
                      Engagement
                    </span>
                    <span className="mt-0.5 block text-[13px] font-semibold text-app-text tabular-nums">
                      {formatMetric(
                        "engagementRate",
                        post.metrics.engagementRate
                      )}
                    </span>
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AccountPerformanceTable({
  integrations,
  posts,
  followers,
  selectedAccountId,
  onSelectAccount,
  onOpenPlatform,
}: {
  integrations: PostFastSocialIntegration[]
  posts: LatestPost[]
  followers: AccountFollowerSnapshot[]
  selectedAccountId: string
  onSelectAccount: (id: string) => void
  onOpenPlatform: (platform: string) => void
}) {
  const [page, setPage] = useState(0)
  const pageSize = 8
  const rows = integrations
    .map((integration) => {
      const accountPosts = posts.filter(
        (post) => post.integrationId === integration.integration_id
      )
      const accountFollowers = followers.filter(
        (point) => point.integrationId === integration.integration_id
      )
      return {
        integration,
        followers: latestFollower(accountFollowers),
        impressions: metricAggregate(accountPosts, "impressions"),
        engagementRate: weightedEngagementRate(accountPosts),
      }
    })
    .sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1))
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = rows.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  )
  return (
    <section className="overflow-hidden rounded-[16px] border border-app-panel-border bg-app-surface">
      <div className="flex items-end justify-between gap-4 p-5 pb-4">
        <SectionHeading
          title="Accounts"
          description="Followers, measured impressions, and weighted engagement by connected account."
        />
        <PaginationControls
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          label="accounts"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-app-surface-subtle text-[10px] font-semibold tracking-[0.04em] text-app-muted-text">
            <tr>
              <th className="px-5 py-3">Account</th>
              <th className="px-4 py-3 text-right">Followers</th>
              <th className="px-4 py-3 text-right">Impressions</th>
              <th className="px-5 py-3 text-right">Engagement rate</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const active =
                selectedAccountId === row.integration.integration_id
              return (
                <tr
                  key={row.integration.integration_id}
                  className={cn(
                    "group border-t border-[#efedf4] transition",
                    active ? "bg-[#f6f1ff]" : "hover:bg-app-surface-subtle"
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectAccount(row.integration.integration_id)
                        }
                        className="lc-focus-ring flex min-w-0 items-center gap-3 rounded-[8px] text-left"
                      >
                        <AccountProfileIcon
                          integration={row.integration}
                          size="md"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold text-app-text">
                            {row.integration.name}
                          </span>
                          <span className="mt-0.5 block text-[10px] font-medium text-app-text-faint">
                            {providerName(row.integration.provider)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPlatform(
                            normalizeProvider(row.integration.provider)
                          )
                        }
                        className="lc-focus-ring ml-auto shrink-0 rounded-[7px] px-2 py-1 text-[10px] font-semibold text-[#6d28d9] opacity-0 transition group-hover:opacity-100 hover:bg-[#efe8fb] focus:opacity-100 md:opacity-100"
                      >
                        Compare platform
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right text-[12px] font-semibold text-app-text tabular-nums">
                    {formatOptionalNumber(row.followers)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-[12px] font-semibold text-app-text tabular-nums">
                    {formatOptionalNumber(row.impressions)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-[12px] font-semibold text-app-text tabular-nums">
                    {row.engagementRate === undefined
                      ? "—"
                      : `${row.engagementRate.toFixed(2)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PlatformAnalytics({
  platform,
  accounts,
  selectedIds,
  onSelectedIdsChange,
  metrics,
  metric,
  onMetricChange,
  chartMode,
  onChartModeChange,
  snapshots,
  followerSnapshots,
  posts,
  capabilities,
  onSelectPost,
}: {
  platform: string
  accounts: PostFastSocialIntegration[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  metrics: CanonicalMetric[]
  metric: CanonicalMetric
  onMetricChange: (metric: CanonicalMetric) => void
  chartMode: "absolute" | "indexed"
  onChartModeChange: (mode: "absolute" | "indexed") => void
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  posts: LatestPost[]
  capabilities: AnalyticsPayload["capabilities"]
  onSelectPost: (post: LatestPost) => void
}) {
  const selectedSet = new Set(selectedIds)
  const selectedAccounts = accounts.filter((account) =>
    selectedSet.has(account.integration_id)
  )
  const selectedPosts = posts.filter((post) =>
    selectedSet.has(post.integrationId)
  )
  const comparison = comparisonSeries({
    accounts: selectedAccounts,
    snapshots,
    followers: followerSnapshots,
    metric,
    indexed: chartMode === "indexed",
  })
  const values = selectedAccounts.map((account) => ({
    account,
    value: accountMetricCurrent({
      integrationId: account.integration_id,
      metric,
      posts,
      followers: followerSnapshots,
    }),
    change: accountMetricChange({
      integrationId: account.integration_id,
      metric,
      snapshots,
      followers: followerSnapshots,
    }),
  }))
  const current =
    metric === "engagementRate"
      ? weightedEngagementRate(selectedPosts)
      : sumDefined(values.map((item) => item.value))
  const coverage = values.filter((item) => item.value !== undefined).length
  const recent = [...selectedPosts].sort(
    (a, b) => postTimestamp(b) - postTimestamp(a)
  )
  const supported = capabilitiesForSelected(accounts, selectedIds, capabilities)
  const canVisualize = supported || metric === "followers"

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      if (selectedIds.length === 1) return
      onSelectedIdsChange(selectedIds.filter((item) => item !== id))
    } else {
      onSelectedIdsChange([...selectedIds, id])
    }
  }

  return (
    <div className="space-y-8">
      <AccountSelectorRail
        integrations={accounts}
        selectedIds={selectedIds}
        multi
        onToggle={toggle}
        onSelectAll={() =>
          onSelectedIdsChange(
            selectedIds.length === accounts.length
              ? [accounts[0].integration_id]
              : accounts.map((account) => account.integration_id)
          )
        }
      />

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-app-text">
              Metric
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-app-muted-text">
              Choose one comparable measure. Availability reflects selected
              accounts.
            </p>
          </div>
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          role="radiogroup"
          aria-label="Metric"
        >
          {metrics.map((item) => {
            const available = metricAccountCoverage({
              metric: item,
              accounts,
              selectedIds,
              posts,
              followers: followerSnapshots,
            })
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={metric === item}
                onClick={() => onMetricChange(item)}
                className={cn(
                  "lc-focus-ring shrink-0 rounded-[9px] border px-3 py-2 text-[11px] font-semibold transition",
                  metric === item
                    ? "border-[#9b7bd5] bg-[#6d28d9] text-white shadow-[0_6px_16px_rgba(82,44,145,0.2)]"
                    : "border-app-panel-border bg-app-surface text-app-text-soft hover:bg-app-control-hover"
                )}
              >
                {metricLabel(item, platform)}{" "}
                <span className="opacity-70">
                  {available}/{selectedIds.length}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {metrics.length === 0 || !canVisualize ? (
        <AnalyticsState
          title={`${providerName(platform)} post analytics are unavailable`}
          description="PostFast does not currently expose a validated post-metric set for this platform. Follower comparison remains available when stored history exists."
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <CompactKpi
              label={
                metric === "engagementRate" ? "Weighted rate" : "Current total"
              }
              value={formatMetric(metric, current)}
              note={metricLabel(metric, platform)}
            />
            <CompactKpi
              label="Change in range"
              value={formatChange(
                sumDefined(values.map((item) => item.change))
              )}
              note="First to last comparable snapshot"
            />
            <CompactKpi
              label="Coverage"
              value={`${coverage} / ${selectedIds.length}`}
              note="Selected accounts with data"
            />
          </section>

          <ComparisonChart
            platform={platform}
            accounts={selectedAccounts}
            data={comparison}
            metric={metric}
            mode={chartMode}
            onModeChange={onChartModeChange}
          />

          <PlatformBreakdown
            platform={platform}
            metric={metric}
            rows={values}
            total={current}
          />

          <RecentPosts
            title={`Recent ${providerName(platform)} posts`}
            description="Newest posts from the selected accounts, with the active metric shown first."
            posts={recent}
            integrations={accounts}
            metric={metric}
            onSelect={onSelectPost}
          />
        </>
      )}
    </div>
  )
}

function ComparisonChart({
  platform,
  accounts,
  data,
  metric,
  mode,
  onModeChange,
}: {
  platform: string
  accounts: PostFastSocialIntegration[]
  data: Array<Record<string, string | number | undefined>>
  metric: CanonicalMetric
  mode: "absolute" | "indexed"
  onModeChange: (mode: "absolute" | "indexed") => void
}) {
  return (
    <section className="rounded-[16px] border border-app-panel-border bg-app-surface p-5 shadow-[0_14px_40px_rgba(35,24,67,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          title="Account comparison over time"
          description={`${metricLabel(metric, platform)} by stored capture date. Missing account values remain gaps.`}
        />
        <div className="flex rounded-[9px] bg-app-surface-subtle p-1">
          {(["absolute", "indexed"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
              className={cn(
                "lc-focus-ring rounded-[7px] px-2.5 py-1.5 text-[10px] font-semibold transition",
                mode === item
                  ? "bg-app-surface text-app-text shadow-sm"
                  : "text-app-muted-text"
              )}
            >
              {item === "absolute" ? "Absolute values" : "Indexed growth"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {accounts.map((account, index) => (
          <div
            key={account.integration_id}
            className="flex items-center gap-2 text-[10px] font-semibold text-app-text-soft"
          >
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor: seriesColors[index % seriesColors.length],
              }}
            />
            {account.name}
          </div>
        ))}
      </div>
      <div className="mt-3 h-[340px]">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 14, right: 12, bottom: 0, left: 2 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="#eceaf1"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#858592" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 10, fill: "#858592" }}
                tickFormatter={(value) =>
                  mode === "indexed"
                    ? `${value}`
                    : formatAnalyticsNumber(Number(value))
                }
              />
              <Tooltip
                content={
                  <ComparisonTooltip
                    accounts={accounts}
                    metric={metric}
                    mode={mode}
                  />
                }
              />
              {accounts.map((account, index) => (
                <Line
                  key={account.integration_id}
                  type="monotone"
                  dataKey={account.integration_id}
                  name={account.name}
                  stroke={seriesColors[index % seriesColors.length]}
                  strokeWidth={2.35}
                  connectNulls={false}
                  dot={false}
                  activeDot={{ r: 3.5 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center rounded-[10px] bg-app-surface-subtle text-[12px] font-medium text-app-text-faint">
            Sync again later to build a comparison curve.
          </div>
        )}
      </div>
    </section>
  )
}

function PlatformBreakdown({
  platform,
  metric,
  rows,
  total,
}: {
  platform: string
  metric: CanonicalMetric
  rows: Array<{
    account: PostFastSocialIntegration
    value?: number
    change?: number
  }>
  total: number | undefined
}) {
  const [page, setPage] = useState(0)
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = rows.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  )
  return (
    <section className="overflow-hidden rounded-[16px] border border-app-panel-border bg-app-surface">
      <div className="flex items-end justify-between gap-4 p-5 pb-4">
        <SectionHeading
          title="Account breakdown"
          description={`Current ${metricLabel(metric, platform).toLowerCase()}, movement, and contribution.`}
        />
        <PaginationControls
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          label="account breakdown"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-app-surface-subtle text-[10px] font-semibold text-app-muted-text">
            <tr>
              <th className="px-5 py-3">Account</th>
              <th className="px-4 py-3 text-right">Current</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-5 py-3 text-right">Share of selected total</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr
                key={row.account.integration_id}
                className="border-t border-[#efedf4]"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor:
                          seriesColors[index % seriesColors.length],
                      }}
                    />
                    <AccountProfileIcon integration={row.account} size="sm" />
                    <div>
                      <div className="text-[12px] font-semibold text-app-text">
                        {row.account.name}
                      </div>
                      <div className="text-[10px] font-medium text-app-text-faint">
                        {providerName(platform)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right text-[12px] font-semibold tabular-nums">
                  {formatMetric(metric, row.value)}
                </td>
                <td className="px-4 py-3.5 text-right text-[12px] font-semibold tabular-nums">
                  {formatChange(row.change)}
                </td>
                <td className="px-5 py-3.5 text-right text-[12px] font-semibold tabular-nums">
                  {metric === "engagementRate" ||
                  row.value === undefined ||
                  !total
                    ? "—"
                    : `${((row.value / total) * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CompactKpi({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <article className="rounded-[13px] bg-app-surface-subtle p-4">
      <div className="text-[10px] font-semibold text-app-muted-text">
        {label}
      </div>
      <div className="mt-2 text-[24px] leading-none font-semibold tracking-[-0.03em] text-app-text tabular-nums">
        {value}
      </div>
      <div className="mt-2 text-[10px] font-medium text-app-text-faint">
        {note}
      </div>
    </article>
  )
}

function PostThumbnail({ post }: { post: LatestPost }) {
  return (
    <span
      className="relative block aspect-[16/9] overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#e5dbf7,transparent_46%),linear-gradient(135deg,#f4f1f8,#e8e5ed)] bg-cover bg-center"
      style={
        post.thumbnailUrl
          ? {
              backgroundImage: `url("${post.thumbnailUrl.replace(/"/g, "%22")}")`,
            }
          : undefined
      }
    >
      {!post.thumbnailUrl ? (
        <span className="absolute inset-0 grid place-items-center px-5 text-center text-[13px] leading-5 font-semibold text-[#56476e]">
          {(post.content || "Recent post").slice(0, 74)}
        </span>
      ) : null}
      <span className="absolute right-2 bottom-2 rounded-[5px] bg-black/62 px-1.5 py-1 text-[8px] font-semibold text-white backdrop-blur-sm">
        {postContentTypeLabel(
          post.contentType ||
            inferPostContentType({
              sourceType: post.sourceType,
              metrics: post.rawMetrics,
            })
        )}
      </span>
    </span>
  )
}

function DeltaLabel({ delta }: { delta: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[10px] font-semibold",
        delta >= 0
          ? "bg-[#edf8f1] text-[#287149]"
          : "bg-[#fff0ee] text-[#9d4139]"
      )}
    >
      {delta >= 0 ? (
        <IconArrowUpRight className="size-3" />
      ) : (
        <IconArrowDownRight className="size-3" />
      )}
      {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

function CompactTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[8px] border border-app-panel-border bg-white px-3 py-2 shadow-lg">
      <div className="text-[9px] font-medium text-app-text-faint">{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums">
        {formatAnalyticsNumber(Number(payload[0]?.value ?? 0))}
      </div>
    </div>
  )
}

function ComparisonTooltip({
  active,
  payload,
  label,
  accounts,
  metric,
  mode,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>
  label?: string
  accounts: PostFastSocialIntegration[]
  metric: CanonicalMetric
  mode: "absolute" | "indexed"
}) {
  if (!active || !payload?.length) return null
  const names = new Map(
    accounts.map((account) => [account.integration_id, account.name])
  )
  return (
    <div className="min-w-[170px] rounded-[9px] border border-app-panel-border bg-white p-3 shadow-xl">
      <div className="text-[9px] font-medium text-app-text-faint">{label}</div>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div
            key={String(item.dataKey)}
            className="flex items-center justify-between gap-4 text-[10px]"
          >
            <span className="flex items-center gap-1.5 font-medium text-app-text-soft">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {names.get(String(item.dataKey))}
            </span>
            <span className="font-semibold tabular-nums">
              {mode === "indexed"
                ? Number(item.value).toFixed(1)
                : formatMetric(metric, item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-app-text">
        {title}
      </h2>
      <p className="mt-1 text-[12px] font-medium text-app-muted-text">
        {description}
      </p>
    </div>
  )
}

function AnalyticsState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#d8d6e0] bg-app-surface-subtle px-6 py-16 text-center">
      <IconUsers className="mx-auto size-6 text-[#9b9aa3]" />
      <div className="mt-4 text-[16px] font-semibold text-app-text">
        {title}
      </div>
      <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-5 font-medium text-app-muted-text">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-20 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonBlock key={index} className="h-48 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} className="h-64 rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-[320px] rounded-xl" />
    </div>
  )
}

function latestSnapshotsByPost(
  snapshots: PostFastMetricSnapshot[]
): LatestPost[] {
  const groups = new Map<string, PostFastMetricSnapshot[]>()
  for (const snapshot of snapshots) {
    const key = `${snapshot.integrationId}:${snapshot.postId}`
    groups.set(key, [...(groups.get(key) ?? []), snapshot])
  }
  return [...groups.values()].map((group) => {
    const sorted = group.sort(
      (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
    )
    return { ...sorted[sorted.length - 1], previous: sorted.at(-2) }
  })
}

function postMetricSeries(
  snapshots: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  const latestByPostAndDay = latestSnapshotsPerPostDay(snapshots)
  const byDay = new Map<string, number[]>()
  for (const snapshot of latestByPostAndDay.values()) {
    const value = snapshot.metrics[metric]
    if (value === undefined) continue
    const day = snapshot.capturedAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), value])
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      label: DateTime.fromISO(date).toFormat("LLL d"),
      value: values.reduce((sum, value) => sum + value, 0),
    }))
}

function audienceSeries(
  snapshots: AccountFollowerSnapshot[],
  integrationIds: string[]
) {
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  )
  const days = [
    ...new Set(sorted.map((point) => point.capturedAt.slice(0, 10))),
  ].sort()
  return days.flatMap((day) => {
    const end = Date.parse(`${day}T23:59:59.999Z`)
    const values = integrationIds.flatMap((id) => {
      const latest = sorted
        .filter(
          (point) =>
            point.integrationId === id && Date.parse(point.capturedAt) <= end
        )
        .at(-1)
      return latest ? [latest.followers] : []
    })
    return values.length
      ? [
          {
            date: day,
            label: DateTime.fromISO(day).toFormat("LLL d"),
            value: values.reduce((a, b) => a + b, 0),
          },
        ]
      : []
  })
}

function comparisonSeries({
  accounts,
  snapshots,
  followers,
  metric,
  indexed,
}: {
  accounts: PostFastSocialIntegration[]
  snapshots: PostFastMetricSnapshot[]
  followers: AccountFollowerSnapshot[]
  metric: CanonicalMetric
  indexed: boolean
}) {
  const byAccount = new Map<string, Array<{ date: string; value: number }>>()
  for (const account of accounts) {
    const series =
      metric === "followers"
        ? audienceSeries(
            followers.filter(
              (point) => point.integrationId === account.integration_id
            ),
            [account.integration_id]
          )
        : accountPostMetricSeries(
            snapshots.filter(
              (snapshot) => snapshot.integrationId === account.integration_id
            ),
            metric
          )
    const baseline = series.find((point) => point.value > 0)?.value
    byAccount.set(
      account.integration_id,
      series.map((point) => ({
        date: point.date,
        value:
          indexed && baseline ? (point.value / baseline) * 100 : point.value,
      }))
    )
  }
  const days = [
    ...new Set(
      [...byAccount.values()].flatMap((series) =>
        series.map((point) => point.date)
      )
    ),
  ].sort()
  return days.map((date) => {
    const row: Record<string, string | number | undefined> = {
      date,
      label: DateTime.fromISO(date).toFormat("LLL d"),
    }
    for (const account of accounts)
      row[account.integration_id] = byAccount
        .get(account.integration_id)
        ?.find((point) => point.date === date)?.value
    return row
  })
}

function accountPostMetricSeries(
  snapshots: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  if (metric !== "engagementRate") return postMetricSeries(snapshots, metric)
  const latest = latestSnapshotsPerPostDay(snapshots)
  const byDay = new Map<string, PostFastMetricSnapshot[]>()
  for (const snapshot of latest.values()) {
    const day = snapshot.capturedAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), snapshot])
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, points]) => {
      const value = weightedEngagementRate(points)
      return value === undefined
        ? []
        : [{ date, label: DateTime.fromISO(date).toFormat("LLL d"), value }]
    })
}

function latestSnapshotsPerPostDay(snapshots: PostFastMetricSnapshot[]) {
  const map = new Map<string, PostFastMetricSnapshot>()
  for (const snapshot of [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  )) {
    map.set(
      `${snapshot.capturedAt.slice(0, 10)}:${snapshot.integrationId}:${snapshot.postId}`,
      snapshot
    )
  }
  return map
}

function metricAggregate(
  posts: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  return sumDefined(posts.map((post) => post.metrics[metric]))
}

function weightedEngagementRate(posts: PostFastMetricSnapshot[]) {
  const comparable = posts.flatMap((post) => {
    const interactions = post.metrics.interactions
    const exposure =
      post.metrics.impressions ?? post.metrics.views ?? post.metrics.reach
    return interactions !== undefined && exposure !== undefined && exposure > 0
      ? [{ interactions, exposure }]
      : []
  })
  if (!comparable.length) return undefined
  const interactions = comparable.reduce(
    (sum, row) => sum + row.interactions,
    0
  )
  const exposure = comparable.reduce((sum, row) => sum + row.exposure, 0)
  return exposure ? (interactions / exposure) * 100 : undefined
}

function accountMetricCurrent({
  integrationId,
  metric,
  posts,
  followers,
}: {
  integrationId: string
  metric: CanonicalMetric
  posts: LatestPost[]
  followers: AccountFollowerSnapshot[]
}) {
  if (metric === "followers")
    return latestFollower(
      followers.filter((point) => point.integrationId === integrationId)
    )
  const accountPosts = posts.filter(
    (post) => post.integrationId === integrationId
  )
  return metric === "engagementRate"
    ? weightedEngagementRate(accountPosts)
    : metricAggregate(accountPosts, metric)
}

function accountMetricChange({
  integrationId,
  metric,
  snapshots,
  followers,
}: {
  integrationId: string
  metric: CanonicalMetric
  snapshots: PostFastMetricSnapshot[]
  followers: AccountFollowerSnapshot[]
}) {
  const series =
    metric === "followers"
      ? audienceSeries(
          followers.filter((point) => point.integrationId === integrationId),
          [integrationId]
        )
      : accountPostMetricSeries(
          snapshots.filter(
            (snapshot) => snapshot.integrationId === integrationId
          ),
          metric
        )
  if (series.length < 2) return undefined
  return series.at(-1)!.value - series[0].value
}

function availablePlatformMetrics({
  accounts,
  capabilities,
  snapshots,
  followers,
  selectedIds,
}: {
  accounts: PostFastSocialIntegration[]
  capabilities: AnalyticsPayload["capabilities"]
  snapshots: PostFastMetricSnapshot[]
  followers: AccountFollowerSnapshot[]
  selectedIds: string[]
}) {
  const ids = new Set(
    selectedIds.length
      ? selectedIds
      : accounts.map((item) => item.integration_id)
  )
  const metrics = new Set<CanonicalMetric>()
  for (const account of accounts) {
    if (!ids.has(account.integration_id)) continue
    for (const metric of capabilities[account.integration_id]?.metrics ?? [])
      metrics.add(metric)
  }
  if (
    snapshots.some(
      (point) =>
        ids.has(point.integrationId) &&
        point.metrics.engagementRate !== undefined
    )
  )
    metrics.add("engagementRate")
  if (followers.some((point) => ids.has(point.integrationId)))
    metrics.add("followers")
  return canonicalMetricOrder.filter((metric) => metrics.has(metric))
}

function defaultPlatformMetric(platform: string, metrics: CanonicalMetric[]) {
  const preferred: CanonicalMetric[] = [
    "instagram",
    "facebook",
    "linkedin",
    "pinterest",
  ].includes(platform)
    ? ["impressions", "views"]
    : ["views", "impressions"]
  return (
    preferred.find((metric) => metrics.includes(metric)) ??
    metrics[0] ??
    initialMetricForPlatform(platform)
  )
}

function initialMetricForPlatform(platform?: string): CanonicalMetric {
  if (
    [
      "x",
      "threads",
      "bluesky",
      "telegram",
      "google-business-profile",
      "google",
      "tiktok-creative",
      "tiktok-seller",
    ].includes(platform || "")
  )
    return "followers"
  if (["tiktok", "youtube"].includes(platform || "")) return "views"
  return "impressions"
}

function capabilitiesForSelected(
  accounts: PostFastSocialIntegration[],
  selectedIds: string[],
  capabilities: AnalyticsPayload["capabilities"]
) {
  const selected = new Set(selectedIds)
  return accounts.some(
    (account) =>
      selected.has(account.integration_id) &&
      capabilities[account.integration_id]?.supported
  )
}

function metricAccountCoverage({
  metric,
  accounts,
  selectedIds,
  posts,
  followers,
}: {
  metric: CanonicalMetric
  accounts: PostFastSocialIntegration[]
  selectedIds: string[]
  posts: LatestPost[]
  followers: AccountFollowerSnapshot[]
}) {
  return accounts.filter(
    (account) =>
      selectedIds.includes(account.integration_id) &&
      accountMetricCurrent({
        integrationId: account.integration_id,
        metric,
        posts,
        followers,
      }) !== undefined
  ).length
}

function latestFollowerTotal(
  snapshots: AccountFollowerSnapshot[],
  ids: string[]
) {
  return sumDefined(
    ids.map((id) =>
      latestFollower(snapshots.filter((point) => point.integrationId === id))
    )
  )
}

function latestFollower(points: AccountFollowerSnapshot[]) {
  return [...points]
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
    .at(-1)?.followers
}

function seriesDelta(series: Array<{ value: number }>) {
  if (series.length < 2 || series[0].value === 0) return null
  return ((series.at(-1)!.value - series[0].value) / series[0].value) * 100
}

function postCoverageLabel(posts: LatestPost[], metric: CanonicalMetric) {
  const count = posts.filter(
    (post) => post.metrics[metric] !== undefined
  ).length
  return `${count} of ${posts.length} posts report this metric`
}

function accountCoverageLabel(ids: string[], total: number) {
  return `${new Set(ids).size} of ${total} accounts report followers`
}

function sumDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined)
  return defined.length
    ? defined.reduce((sum, value) => sum + value, 0)
    : undefined
}

function postTimestamp(post: LatestPost) {
  return Date.parse(post.publishedAt || post.capturedAt) || 0
}

function formatPostDate(post: LatestPost) {
  const date = DateTime.fromISO(post.publishedAt || post.capturedAt)
  return date.isValid ? date.toFormat("LLL d") : "Recent"
}

function formatMetric(metric: CanonicalMetric, value: number | undefined) {
  if (value === undefined) return "—"
  return metric === "engagementRate"
    ? `${value.toFixed(2)}%`
    : formatAnalyticsNumber(value)
}

function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "—" : formatAnalyticsNumber(value)
}

function formatChange(value: number | undefined) {
  if (value === undefined) return "—"
  return `${value > 0 ? "+" : ""}${formatAnalyticsNumber(value)}`
}

function formatAnalyticsNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)
}

function fallbackIntegration(post: LatestPost): PostFastSocialIntegration {
  return {
    integration_id: post.integrationId,
    provider: post.provider as PostFastSocialIntegration["provider"],
    name: `${providerName(post.provider)} account`,
  }
}
