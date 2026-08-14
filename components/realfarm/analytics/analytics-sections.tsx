"use client"

import Image from "next/image"
import { useState } from "react"
import type * as React from "react"
import type { AnalyticsPayload } from "./analytics-view"
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
  IconUsers,
  IconWorld,
} from "@tabler/icons-react"
import { SelectControl } from "@/components/ui/form-controls"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import {
  AccountProfileIcon,
  normalizeProvider,
  providerName,
} from "@/components/realfarm/analytics/account-profile-icon"
import { PaginationControls } from "@/components/realfarm/analytics/pagination-controls"
import { metricLabel, type CanonicalMetric } from "@/lib/metric-registry"
import type {
  AccountFollowerSnapshot,
  PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import {
  inferPostContentType,
  postContentTypeLabel,
} from "@/lib/post-content-type"
import { cn } from "@/lib/utils"
import {
  postMetricSeries,
  postExposureSeries,
  audienceSeries,
  comparisonSeries,
  metricAggregate,
  postExposureAggregate,
  postExposureLabel,
  weightedEngagementRate,
  accountMetricCurrent,
  accountMetricChange,
  capabilitiesForSelected,
  metricAccountCoverage,
  latestFollowerTotal,
  latestFollower,
  seriesDelta,
  postCoverageLabel,
  postExposureCoverageLabel,
  accountCoverageLabel,
  sumDefined,
  postTimestamp,
  formatPostDate,
  formatMetric,
  formatOptionalNumber,
  formatChange,
  formatAnalyticsNumber,
  fallbackIntegration,
  type LatestPost,
} from "./analytics-selectors"

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

export function AnalyticsHeader({
  platform,
  days,
  onDaysChange,
  onBack,
}: {
  platform: string
  days: number
  onDaysChange: (days: number) => void
  onBack: () => void
}) {
  return (
    <header className="mb-7 flex min-w-0 flex-wrap items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-2">
        {platform ? (
          <button
            type="button"
            onClick={onBack}
            className="lc-focus-ring inline-flex h-9 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-semibold text-app-muted-text transition hover:bg-app-surface-subtle hover:text-app-text"
          >
            <IconArrowLeft className="size-4" /> Back to overview
          </button>
        ) : null}
        <h1 className="flex min-h-9 min-w-0 items-center text-[28px] leading-tight font-semibold tracking-[-0.04em] text-app-text sm:text-[30px]">
          {platform ? `${providerName(platform)} analytics` : "Analytics"}
        </h1>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
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
      </div>
    </header>
  )
}

export function AnalyticsOverview({
  integrations,
  posts,
  snapshots,
  followerSnapshots,
  slideshowPreviews,
  onSelectPost,
}: {
  integrations: SocialIntegration[]
  posts: LatestPost[]
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  slideshowPreviews: Record<string, string[]>
  onSelectPost: (post: LatestPost) => void
}) {
  const selectedIds = integrations.map((item) => item.integration_id)
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
          label={postExposureLabel(visiblePosts)}
          value={postExposureAggregate(visiblePosts)}
          series={postExposureSeries(visibleSnapshots)}
          color="#d43791"
          availability={postExposureCoverageLabel(visiblePosts)}
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
        posts={recent}
        integrations={integrations}
        slideshowPreviews={slideshowPreviews}
        onSelect={onSelectPost}
      />
    </div>
  )
}

export function AccountSelectorRail({
  integrations,
  selectedIds,
  allSelected,
  multi,
  onToggle,
  onSelectAll,
}: {
  integrations: SocialIntegration[]
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
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-app-text">
            {multi ? "Accounts" : "Connected accounts"}
          </h2>
          {multi ? (
            <span className="text-[11px] font-medium text-app-muted-text">
              {selectedIds.length} of {integrations.length} selected
            </span>
          ) : null}
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

export function PortfolioMetricCard({
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
            More points will appear after the next automatic refresh
          </div>
        )}
      </div>
    </article>
  )
}

export function RecentPosts({
  title,
  posts,
  integrations,
  slideshowPreviews = {},
  metric,
  onSelect,
}: {
  title: string
  posts: LatestPost[]
  integrations: SocialIntegration[]
  slideshowPreviews?: Record<string, string[]>
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
        <SectionHeading title={title} />
        <PaginationControls
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          label="recent posts"
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visiblePosts.map((post) => {
          const account =
            accounts.get(post.integrationId) ?? fallbackIntegration(post)
          const slideImages =
            slideshowPreviews[post.postId] ??
            (post.publication
              ? slideshowPreviews[post.publication.id]
              : undefined) ??
            []
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
              className="lc-focus-ring group overflow-hidden rounded-card border border-app-panel-border bg-app-surface text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(35,24,67,0.09)] active:translate-y-0"
            >
              <PostThumbnail post={post} slideImages={slideImages} />
              <span className="block p-3.5">
                <span className="flex items-center justify-between gap-2">
                  <AccountProfileIcon integration={account} size="sm" tooltip />
                  <span className="text-[9px] font-medium text-app-text-faint">
                    {formatPostDate(post)}
                  </span>
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

export function AccountPerformanceTable({
  integrations,
  posts,
  followers,
  selectedAccountId,
  onSelectAccount,
  onOpenPlatform,
}: {
  integrations: SocialIntegration[]
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
        <SectionHeading title="Accounts" />
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

export function PlatformAnalytics({
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
  accounts: SocialIntegration[]
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

export function ComparisonChart({
  accounts,
  data,
  metric,
  mode,
  onModeChange,
}: {
  accounts: SocialIntegration[]
  data: Array<Record<string, string | number | undefined>>
  metric: CanonicalMetric
  mode: "absolute" | "indexed"
  onModeChange: (mode: "absolute" | "indexed") => void
}) {
  return (
    <section className="rounded-[16px] border border-app-panel-border bg-app-surface p-5 shadow-[0_14px_40px_rgba(35,24,67,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading title="Account comparison over time" />
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
            More points will appear after the next automatic refresh.
          </div>
        )}
      </div>
    </section>
  )
}

export function PlatformBreakdown({
  platform,
  metric,
  rows,
  total,
}: {
  platform: string
  metric: CanonicalMetric
  rows: Array<{
    account: SocialIntegration
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
        <SectionHeading title="Account breakdown" />
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

export function CompactKpi({
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

export function PostThumbnail({
  post,
  slideImages = [],
}: {
  post: LatestPost
  slideImages?: string[]
}) {
  const contentType =
    post.contentType ||
    inferPostContentType({
      sourceType: post.sourceType,
      metrics: post.rawMetrics,
    })
  const previewUrl = slideImages[0] || post.thumbnailUrl
  const isSlideshow = contentType === "slideshow"
  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#e5dbf7,transparent_46%),linear-gradient(135deg,#f4f1f8,#e8e5ed)]",
        isSlideshow ? "aspect-[4/5]" : "aspect-[16/9]"
      )}
    >
      {previewUrl ? (
        <Image
          src={previewUrl}
          alt={
            isSlideshow
              ? "First slide from the published slideshow"
              : "Published post preview"
          }
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          unoptimized
          className={cn(
            "transition duration-300 group-hover:scale-[1.015]",
            isSlideshow ? "object-contain" : "object-cover"
          )}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-5 text-center text-[13px] leading-5 font-semibold text-[#56476e]">
          {(post.content || "Recent post").slice(0, 74)}
        </span>
      )}
      {slideImages.length > 1 ? (
        <span className="absolute top-2 right-2 rounded-[6px] bg-black/68 px-2 py-1 text-[9px] font-semibold text-white tabular-nums backdrop-blur-sm">
          1 / {slideImages.length}
        </span>
      ) : null}
      <span className="absolute right-2 bottom-2 rounded-[5px] bg-black/62 px-1.5 py-1 text-[8px] font-semibold text-white backdrop-blur-sm">
        {postContentTypeLabel(contentType)}
      </span>
    </span>
  )
}

export function DeltaLabel({ delta }: { delta: number }) {
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

export function CompactTooltip({
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

export function ComparisonTooltip({
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
  accounts: SocialIntegration[]
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

export function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-app-text">
      {title}
    </h2>
  )
}

export function AnalyticsState({
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

export function AnalyticsSkeleton() {
  return (
    <div className="max-w-full min-w-0 space-y-6 overflow-hidden">
      <SkeletonBlock className="h-20 max-w-full rounded-xl" />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="h-48 max-w-full min-w-0 rounded-xl"
          />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="h-64 max-w-full min-w-0 rounded-xl"
          />
        ))}
      </div>
      <SkeletonBlock className="h-[320px] max-w-full rounded-xl" />
    </div>
  )
}
