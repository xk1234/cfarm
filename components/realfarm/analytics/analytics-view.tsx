"use client"

import { useMemo, useState } from "react"
import { DateTime } from "luxon"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconChartBar,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
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
import { cn } from "@/lib/utils"

type AnalyticsLevel = "overview" | "account" | "posts"
type AnalyticsPayload = {
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

export function AnalyticsView() {
  const [days, setDays] = useState(30)
  const [level, setLevel] = useState<AnalyticsLevel>("overview")
  const [requestedAccountId, setRequestedAccountId] = useState("all")
  const [metric, setMetric] = useState<CanonicalMetric>("views")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [sortMetric, setSortMetric] = useState<CanonicalMetric>("views")
  const [selectedPost, setSelectedPost] = useState<LatestPost | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const requestKey = `/api/analytics/report?days=${days}`
  const { data, error, isLoading, mutate } = useSWR<AnalyticsPayload>(
    requestKey,
    clientSWRFetcher,
    { keepPreviousData: true }
  )
  const integrations = useMemo(
    () => data?.integrations ?? [],
    [data?.integrations]
  )
  const selectedAccountId = integrations.some(
    (integration) => integration.integration_id === requestedAccountId
  )
    ? requestedAccountId
    : requestedAccountId === "all"
      ? "all"
      : integrations[0]?.integration_id || "all"
  const latestPosts = useMemo(
    () => latestSnapshotsByPost(data?.snapshots ?? []),
    [data?.snapshots]
  )
  const visiblePosts = useMemo(
    () =>
      latestPosts
        .filter(
          (post) =>
            (selectedAccountId === "all" ||
              post.integrationId === selectedAccountId) &&
            (sourceFilter === "all" || post.sourceType === sourceFilter)
        )
        .sort(
          (first, second) =>
            (second.metrics[sortMetric] ?? 0) - (first.metrics[sortMetric] ?? 0)
        ),
    [latestPosts, selectedAccountId, sortMetric, sourceFilter]
  )
  const selectedIntegration = integrations.find(
    (integration) => integration.integration_id === selectedAccountId
  )
  const accountIntegration = selectedIntegration ?? integrations[0]
  const accountPosts = accountIntegration
    ? visiblePosts.filter(
        (post) => post.integrationId === accountIntegration.integration_id
      )
    : []
  const selectedCapabilities = selectedIntegration
    ? data?.capabilities[selectedIntegration.integration_id]
    : undefined
  const reportMetrics = selectedCapabilities?.metrics.length
    ? selectedCapabilities.metrics
    : canonicalMetricOrder.filter((item) => item !== "followers")

  async function refresh() {
    setRefreshing(true)
    try {
      await fetchJsonWithTimeout("/api/analytics/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days,
          integrationIds:
            selectedAccountId === "all" ? [] : [selectedAccountId],
        }),
        timeoutMs: 120_000,
      })
      await mutate()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] pb-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-app-muted-text">
            <IconChartBar className="size-4" /> Cross-platform reporting
          </div>
          <h1 className="text-[30px] leading-none font-semibold tracking-[-0.035em] text-[#20201d]">
            Analytics
          </h1>
          <p className="mt-3 max-w-[620px] text-[14px] leading-6 font-medium text-app-muted-text">
            Compare account health, inspect individual posts, and connect
            performance back to the content source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelectControl
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
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
            onClick={() => void refresh()}
            disabled={refreshing || isLoading}
          >
            <IconRefresh
              className={cn("size-4", refreshing && "animate-spin")}
            />
            Sync analytics
          </Button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-app-surface-subtle p-2">
        <div className="flex gap-1">
          {(["overview", "account", "posts"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(value)}
              className={cn(
                "h-9 rounded-[8px] px-3 text-[13px] font-semibold transition active:translate-y-px",
                level === value
                  ? "bg-app-surface text-[#20201d] shadow-[0_1px_3px_rgba(60,55,40,0.12)]"
                  : "text-app-muted-text hover:text-[#20201d]"
              )}
            >
              {value === "posts"
                ? "Post table"
                : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <SelectControl
          value={selectedAccountId}
          onChange={(event) => setRequestedAccountId(event.target.value)}
        >
          <option value="all">All connected accounts</option>
          {integrations.map((integration) => (
            <option
              key={integration.integration_id}
              value={integration.integration_id}
            >
              {integration.name} · {providerName(integration.provider)}
            </option>
          ))}
        </SelectControl>
      </div>

      {data?.integrationWarning ? (
        <div className="mb-4 rounded-[9px] bg-[#fff2d8] px-4 py-3 text-[12px] font-semibold text-[#785511]">
          Showing stored analytics. Connected accounts could not be refreshed
          from PostFast right now.
        </div>
      ) : null}

      {error ? (
        <AnalyticsState
          title="Analytics could not be loaded"
          description={
            error instanceof Error ? error.message : "Try syncing again."
          }
        />
      ) : isLoading && !data ? (
        <AnalyticsSkeleton />
      ) : integrations.length === 0 ? (
        <AnalyticsState
          title="No connected social accounts"
          description="Connect accounts in Settings, then sync analytics to start building history."
        />
      ) : latestPosts.length === 0 ? (
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
      ) : level === "overview" ? (
        <AnalyticsOverview
          integrations={integrations}
          posts={visiblePosts}
          followerSnapshots={data?.followerSnapshots ?? []}
          onSelectAccount={(id) => {
            setRequestedAccountId(id)
            setLevel("account")
          }}
          onSelectPost={setSelectedPost}
        />
      ) : level === "account" ? (
        <AccountAnalytics
          integration={accountIntegration}
          posts={accountPosts}
          snapshots={data?.snapshots ?? []}
          followerSnapshots={data?.followerSnapshots ?? []}
          capabilities={
            selectedCapabilities ??
            data?.capabilities[accountIntegration.integration_id]
          }
          metric={metric}
          onMetricChange={setMetric}
        />
      ) : (
        <PostAnalyticsTable
          posts={visiblePosts}
          integrations={integrations}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          sortMetric={sortMetric}
          onSortMetricChange={setSortMetric}
          onSelect={setSelectedPost}
        />
      )}

      {selectedPost ? (
        <PostDetail
          post={selectedPost}
          snapshots={(data?.snapshots ?? []).filter(
            (snapshot) =>
              snapshot.postId === selectedPost.postId &&
              snapshot.integrationId === selectedPost.integrationId
          )}
          onClose={() => setSelectedPost(null)}
        />
      ) : null}
    </div>
  )
}

function AnalyticsOverview({
  integrations,
  posts,
  followerSnapshots,
  onSelectAccount,
  onSelectPost,
}: {
  integrations: PostFastSocialIntegration[]
  posts: LatestPost[]
  followerSnapshots: AccountFollowerSnapshot[]
  onSelectAccount: (id: string) => void
  onSelectPost: (post: LatestPost) => void
}) {
  const totals = metricTotals(posts)
  const previous = metricTotals(
    posts
      .map((post) => post.previous)
      .filter((post): post is PostFastMetricSnapshot => Boolean(post))
  )
  const top = [...posts]
    .sort(
      (a, b) =>
        (b.metrics.views ?? b.metrics.impressions ?? 0) -
        (a.metrics.views ?? a.metrics.impressions ?? 0)
    )
    .slice(0, 5)
  const bottom = [...posts]
    .filter(
      (post) => (post.metrics.views ?? post.metrics.impressions) !== undefined
    )
    .sort(
      (a, b) =>
        (a.metrics.views ?? a.metrics.impressions ?? 0) -
        (b.metrics.views ?? b.metrics.impressions ?? 0)
    )
    .slice(0, 5)
  const netFollowers = integrations.reduce(
    (total, integration) =>
      total +
      followerNetChange(
        followerSnapshots.filter(
          (point) => point.integrationId === integration.integration_id
        )
      ),
    0
  )
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Views" value={totals.views} previous={previous.views} />
        <KpiCard
          label="Interactions"
          value={totals.interactions}
          previous={previous.interactions}
        />
        <KpiCard label="Posts published" value={posts.length} previous={null} />
        <KpiCard
          label="Net follower change"
          value={netFollowers}
          previous={null}
          signed
        />
      </section>
      <section>
        <SectionHeading
          title="Account health"
          description="Follower movement and reporting availability across every connected account."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((integration) => {
            const points = followerSnapshots
              .filter(
                (point) => point.integrationId === integration.integration_id
              )
              .sort(
                (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
              )
            const accountPosts = posts.filter(
              (post) => post.integrationId === integration.integration_id
            )
            return (
              <button
                key={integration.integration_id}
                type="button"
                onClick={() => onSelectAccount(integration.integration_id)}
                className="rounded-[12px] border border-app-panel-border bg-app-surface p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(70,62,38,0.09)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-app-text">
                      {integration.name}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-app-text-faint">
                      {providerName(integration.provider)} ·{" "}
                      {accountPosts.length} posts
                    </div>
                  </div>
                  <span className="text-[12px] font-semibold text-[#4b765a] tabular-nums">
                    {signedNumber(followerNetChange(points))}
                  </span>
                </div>
                <div className="mt-4 h-16">
                  {points.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={points.map((point) => ({
                          date: point.capturedAt,
                          followers: point.followers,
                        }))}
                      >
                        <Area
                          dataKey="followers"
                          stroke="#597360"
                          fill="#dce9df"
                          fillOpacity={0.8}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center rounded-[6px] bg-[#f6f5f0] text-[11px] font-medium text-app-text-faint">
                      Follower history will build after syncs
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <PostStrip title="Top posts" posts={top} onSelect={onSelectPost} />
        <PostStrip
          title="Underperformers"
          posts={bottom}
          onSelect={onSelectPost}
        />
      </div>
      <BenchmarkPerformance posts={posts} />
    </div>
  )
}

function BenchmarkPerformance({ posts }: { posts: LatestPost[] }) {
  const points = posts.flatMap((post) => {
    const views = post.metrics.views ?? post.metrics.impressions
    return post.benchmark && views !== undefined
      ? [
          {
            score: post.benchmark.overall,
            views,
            content: post.content || "Post",
          },
        ]
      : []
  })
  if (points.length < 2) return null
  return (
    <section className="rounded-[14px] border border-app-panel-border bg-app-surface p-5">
      <SectionHeading
        title="Creative score vs real performance"
        description="Checks whether higher benchmark scores are actually associated with more views."
      />
      <div className="mt-5 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 0, right: 18, top: 8, bottom: 8 }}>
            <CartesianGrid stroke="#ebe9e1" strokeDasharray="4 4" />
            <XAxis
              type="number"
              dataKey="score"
              name="Benchmark"
              domain={[0, 10]}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="number"
              dataKey="views"
              name="Views"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={{ strokeDasharray: "4 4" }} />
            <Scatter data={points} fill="#506b57" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function AccountAnalytics({
  integration,
  posts,
  snapshots,
  followerSnapshots,
  capabilities,
  metric,
  onMetricChange,
}: {
  integration: PostFastSocialIntegration
  posts: LatestPost[]
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  capabilities?: { supported: boolean; metrics: CanonicalMetric[] }
  metric: CanonicalMetric
  onMetricChange: (metric: CanonicalMetric) => void
}) {
  if (!capabilities?.supported)
    return (
      <AnalyticsState
        title={`Post analytics are unavailable for ${providerName(integration.provider)}`}
        description="PostFast does not expose post-level analytics for this platform. Follower history will still appear here when the provider supports it."
      />
    )
  const availableMetrics = capabilities.metrics.length
    ? capabilities.metrics
    : (["views", "interactions"] as CanonicalMetric[])
  const activeMetric = availableMetrics.includes(metric)
    ? metric
    : availableMetrics[0]
  const series = dailyMetricSeries(
    snapshots.filter(
      (snapshot) => snapshot.integrationId === integration.integration_id
    ),
    activeMetric
  )
  const totals = metricTotals(posts)
  const followers = followerSnapshots.filter(
    (point) => point.integrationId === integration.integration_id
  )
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={metricLabel(activeMetric, integration.provider)}
          value={totals[activeMetric] ?? 0}
          previous={null}
        />
        <KpiCard label="Posts in range" value={posts.length} previous={null} />
        <KpiCard
          label="Follower change"
          value={followerNetChange(followers)}
          previous={null}
          signed
        />
      </section>
      <section className="rounded-[14px] border border-app-panel-border bg-app-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title={`${integration.name} performance`}
            description="Stored snapshot history—not a one-point chart dated at publish time."
          />
          <SelectControl
            value={activeMetric}
            onChange={(event) =>
              onMetricChange(event.target.value as CanonicalMetric)
            }
          >
            {availableMetrics.map((item) => (
              <option key={item} value={item}>
                {metricLabel(item, integration.provider)}
              </option>
            ))}
          </SelectControl>
        </div>
        <div className="mt-5 h-[360px]">
          {series.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ebe9e1" strokeDasharray="4 4" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={56} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#506b57"
                  fill="#dce9df"
                  fillOpacity={0.72}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center rounded-[8px] bg-app-surface-subtle text-[13px] font-medium text-app-muted-text">
              Sync at least twice to build a time series.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function PostAnalyticsTable({
  posts,
  integrations,
  sourceFilter,
  onSourceFilterChange,
  sortMetric,
  onSortMetricChange,
  onSelect,
}: {
  posts: LatestPost[]
  integrations: PostFastSocialIntegration[]
  sourceFilter: string
  onSourceFilterChange: (value: string) => void
  sortMetric: CanonicalMetric
  onSortMetricChange: (value: CanonicalMetric) => void
  onSelect: (post: LatestPost) => void
}) {
  const sources = [
    ...new Set(posts.map((post) => post.sourceType || "external")),
  ]
  const names = new Map(
    integrations.map((item) => [item.integration_id, item.name])
  )
  return (
    <section className="overflow-hidden rounded-[14px] border border-app-panel-border bg-app-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceae3] p-4">
        <SectionHeading
          title="Post performance"
          description={`${posts.length} attributed posts`}
        />
        <div className="flex gap-2">
          <Button
            variant="softControl"
            size="compact"
            onClick={() => exportPostAnalyticsCsv(posts, integrations)}
          >
            Export CSV
          </Button>
          <SelectControl
            value={sourceFilter}
            onChange={(event) => onSourceFilterChange(event.target.value)}
          >
            <option value="all">All sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source.replace(/_/g, " ")}
              </option>
            ))}
          </SelectControl>
          <SelectControl
            value={sortMetric}
            onChange={(event) =>
              onSortMetricChange(event.target.value as CanonicalMetric)
            }
          >
            {[
              "views",
              "interactions",
              "likes",
              "comments",
              "shares",
              "saves",
              "engagementRate",
            ].map((item) => (
              <option key={item} value={item}>
                Sort: {metricLabel(item as CanonicalMetric)}
              </option>
            ))}
          </SelectControl>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead className="bg-app-surface-subtle text-[10px] font-bold tracking-[0.06em] text-app-muted-text uppercase">
            <tr>
              <th className="px-4 py-3">Post</th>
              <th className="px-3 py-3">Account</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3 text-right">Creative score</th>
              {[
                "views",
                "interactions",
                "likes",
                "comments",
                "shares",
                "saves",
                "engagementRate",
              ].map((item) => (
                <th key={item} className="px-3 py-3 text-right">
                  {metricLabel(item as CanonicalMetric)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr
                key={`${post.integrationId}:${post.postId}`}
                onClick={() => onSelect(post)}
                className="cursor-pointer border-t border-[#efede6] text-[12px] transition hover:bg-app-surface-subtle"
              >
                <td className="max-w-[320px] px-4 py-3">
                  <div className="truncate font-semibold text-app-text">
                    {post.content || "Untitled post"}
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-app-text-faint">
                    {post.publishedAt
                      ? DateTime.fromISO(post.publishedAt).toFormat(
                          "LLL d, yyyy"
                        )
                      : "External post"}
                  </div>
                </td>
                <td className="px-3 py-3 font-medium text-app-text-soft">
                  {names.get(post.integrationId) || post.integrationId}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-[4px] bg-app-surface-subtle px-2 py-1 text-[10px] font-bold text-app-text-soft">
                    {post.sourceType || "external"}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">
                  {post.benchmark ? post.benchmark.overall.toFixed(1) : "—"}
                </td>
                {[
                  "views",
                  "interactions",
                  "likes",
                  "comments",
                  "shares",
                  "saves",
                  "engagementRate",
                ].map((item) => (
                  <td
                    key={item}
                    className="px-3 py-3 text-right font-semibold text-app-text tabular-nums"
                  >
                    {formatMetric(
                      item as CanonicalMetric,
                      post.metrics[item as CanonicalMetric]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PostDetail({
  post,
  snapshots,
  onClose,
}: {
  post: LatestPost
  snapshots: PostFastMetricSnapshot[]
  onClose: () => void
}) {
  const series = dailyMetricSeries(
    snapshots,
    post.metrics.views !== undefined ? "views" : "impressions"
  )
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-[460px] overflow-y-auto bg-[#fbfaf6] p-6 shadow-[-20px_0_60px_rgba(40,36,25,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="rounded-[5px] bg-[#eeede7] px-2 py-1 text-[10px] font-bold tracking-[0.06em] text-app-text-soft uppercase">
            {post.sourceType || "external"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-semibold text-app-muted-text"
          >
            Close
          </button>
        </div>
        <h2 className="mt-6 text-[22px] leading-7 font-semibold tracking-[-0.02em] text-app-text">
          {post.content || "Post performance"}
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {canonicalMetricOrder
            .filter((metric) => post.metrics[metric] !== undefined)
            .map((metric) => (
              <div key={metric} className="rounded-[8px] bg-app-surface p-3">
                <div className="text-[10px] font-bold tracking-[0.05em] text-app-text-faint uppercase">
                  {metricLabel(metric, post.provider)}
                </div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums">
                  {formatMetric(metric, post.metrics[metric])}
                </div>
              </div>
            ))}
        </div>
        <section className="mt-6 rounded-[10px] bg-app-surface p-4">
          <div className="text-[13px] font-semibold">Performance over time</div>
          <div className="mt-4 h-48">
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area dataKey="value" stroke="#506b57" fill="#dce9df" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-app-text-faint">
                More snapshots are needed for a curve.
              </div>
            )}
          </div>
        </section>
        {post.benchmark ? (
          <section className="mt-4 rounded-[10px] bg-app-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">
                Creative benchmark
              </div>
              <strong className="text-[18px] tabular-nums">
                {post.benchmark.overall.toFixed(1)}/10
              </strong>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              {[
                ["Hook", post.benchmark.hookVirality],
                ["Picture/text", post.benchmark.pictureTextFit],
                ["ICP value", post.benchmark.usefulnessToIcp],
                ["Conversation", post.benchmark.conversationPotential],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-[6px] bg-[#f7f6f1] p-2"
                >
                  <span className="text-app-muted-text">{label}</span>
                  <strong className="float-right tabular-nums">{value}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {post.releaseUrl ? (
          <Button
            variant="action"
            size="appDefault"
            className="mt-6 w-full"
            onClick={() =>
              window.open(post.releaseUrl, "_blank", "noopener,noreferrer")
            }
          >
            Open live post
          </Button>
        ) : null}
      </aside>
    </div>
  )
}

function PostStrip({
  title,
  posts,
  onSelect,
}: {
  title: string
  posts: LatestPost[]
  onSelect: (post: LatestPost) => void
}) {
  return (
    <section>
      <SectionHeading
        title={title}
        description={
          title === "Top posts"
            ? "Highest reach in the selected range."
            : "Posts worth reviewing for weak hooks, timing or fit."
        }
      />
      <div className="mt-3 space-y-2">
        {posts.map((post, index) => (
          <button
            key={`${post.integrationId}:${post.postId}`}
            type="button"
            onClick={() => onSelect(post)}
            className="flex w-full items-center gap-3 rounded-[9px] border border-[#e6e4dc] bg-app-surface p-3 text-left transition hover:-translate-y-px hover:shadow-sm"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-app-surface-subtle text-[12px] font-semibold tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-app-text">
                {post.content || "Untitled post"}
              </span>
              <span className="mt-1 block text-[10px] font-medium text-app-text-faint">
                {providerName(post.provider)} · {post.sourceType || "external"}
              </span>
            </span>
            <span className="text-[13px] font-semibold text-app-text tabular-nums">
              {formatAnalyticsNumber(
                post.metrics.views ?? post.metrics.impressions ?? 0
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
function KpiCard({
  label,
  value,
  previous,
  signed,
}: {
  label: string
  value: number
  previous: number | null
  signed?: boolean
}) {
  const delta =
    previous && previous !== 0 ? ((value - previous) / previous) * 100 : null
  return (
    <article className="rounded-[12px] border border-app-panel-border bg-app-surface p-4">
      <div className="text-[11px] font-semibold text-app-muted-text">{label}</div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.03em] text-app-text tabular-nums">
        {signed ? signedNumber(value) : formatAnalyticsNumber(value)}
      </div>
      {delta !== null ? (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1 text-[11px] font-semibold",
            delta >= 0 ? "text-[#3e7a52]" : "text-[#a5473d]"
          )}
        >
          {delta >= 0 ? (
            <IconArrowUpRight className="size-3.5" />
          ) : (
            <IconArrowDownRight className="size-3.5" />
          )}
          {Math.abs(delta).toFixed(1)}% vs previous snapshot
        </div>
      ) : (
        <div className="mt-3 text-[11px] font-medium text-app-text-faint">
          History builds with each sync
        </div>
      )}
    </article>
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
      <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-app-text">
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
    <div className="rounded-[14px] border border-dashed border-[#d8d6cc] bg-app-surface-subtle px-6 py-16 text-center">
      <IconUsers className="mx-auto size-6 text-[#9b9a93]" />
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
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-[420px] rounded-xl" />
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
function metricTotals(posts: PostFastMetricSnapshot[]) {
  return canonicalMetricOrder.reduce(
    (totals, metric) => ({
      ...totals,
      [metric]: posts.reduce(
        (sum, post) => sum + (post.metrics[metric] ?? 0),
        0
      ),
    }),
    {} as Record<CanonicalMetric, number>
  )
}
function dailyMetricSeries(
  snapshots: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  const latestByPostAndDay = new Map<string, PostFastMetricSnapshot>()
  for (const snapshot of [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  )) {
    const day = DateTime.fromISO(snapshot.capturedAt).toISODate() ?? ""
    latestByPostAndDay.set(
      `${day}:${snapshot.integrationId}:${snapshot.postId}`,
      snapshot
    )
  }
  const days = new Map<string, number>()
  for (const snapshot of latestByPostAndDay.values()) {
    const day = DateTime.fromISO(snapshot.capturedAt).toISODate() ?? ""
    days.set(day, (days.get(day) ?? 0) + (snapshot.metrics[metric] ?? 0))
  }
  return [...days]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, value]) => ({
      date: DateTime.fromISO(date).toFormat("LLL d"),
      value,
    }))
}
function followerNetChange(points: AccountFollowerSnapshot[]) {
  if (points.length === 0) return 0
  const sorted = [...points].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  )
  return sorted[sorted.length - 1].followers - sorted[0].followers
}
function formatMetric(metric: CanonicalMetric, value: number | undefined) {
  if (value === undefined) return "—"
  return metric === "engagementRate"
    ? `${value.toFixed(2)}%`
    : formatAnalyticsNumber(value)
}
function formatAnalyticsNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)
}
function signedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatAnalyticsNumber(value)}`
}
function providerName(provider: string) {
  const names: Record<string, string> = {
    tiktok: "TikTok",
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    x: "X",
    twitter: "X",
    linkedin: "LinkedIn",
    threads: "Threads",
    pinterest: "Pinterest",
    bluesky: "Bluesky",
    telegram: "Telegram",
    google: "Google Business Profile",
    "google-business-profile": "Google Business Profile",
  }
  return names[provider] || provider
}

function exportPostAnalyticsCsv(
  posts: LatestPost[],
  integrations: PostFastSocialIntegration[]
) {
  const accountNames = new Map(
    integrations.map((integration) => [
      integration.integration_id,
      integration.name,
    ])
  )
  const metrics: CanonicalMetric[] = [
    "views",
    "impressions",
    "reach",
    "interactions",
    "likes",
    "comments",
    "shares",
    "saves",
    "clicks",
    "engagementRate",
  ]
  const rows = [
    [
      "content",
      "account",
      "platform",
      "source",
      "published_at",
      "creative_score",
      ...metrics,
    ],
    ...posts.map((post) => [
      post.content || "",
      accountNames.get(post.integrationId) || post.integrationId,
      post.provider,
      post.sourceType || "external",
      post.publishedAt || "",
      post.benchmark?.overall ?? "",
      ...metrics.map((metric) => post.metrics[metric] ?? ""),
    ]),
  ]
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `analytics-${DateTime.local().toISODate()}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
