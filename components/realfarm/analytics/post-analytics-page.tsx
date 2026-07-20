"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { DateTime } from "luxon"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconArrowLeft,
  IconExternalLink,
  IconPhoto,
  IconRefresh,
  IconVideo,
} from "@tabler/icons-react"

import {
  AccountProfileIcon,
  providerName,
} from "@/components/realfarm/analytics/account-profile-icon"
import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import {
  canonicalMetricOrder,
  metricLabel,
  type CanonicalMetric,
} from "@/lib/metric-registry"
import {
  postContentTypeLabel,
  type PostContentType,
} from "@/lib/post-content-type"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import { cn } from "@/lib/utils"

export function PostAnalyticsPage({
  snapshots,
  integration,
  contentType,
}: {
  snapshots: PostFastMetricSnapshot[]
  integration: PostFastSocialIntegration
  contentType: PostContentType
}) {
  const router = useRouter()
  const ordered = useMemo(
    () =>
      [...snapshots].sort(
        (left, right) =>
          Date.parse(left.capturedAt) - Date.parse(right.capturedAt)
      ),
    [snapshots]
  )
  const latest = ordered.at(-1)!
  const metrics = availableMetrics(ordered)
  const [metric, setMetric] = useState<CanonicalMetric>(defaultMetric(metrics))
  const [syncing, setSyncing] = useState(false)
  const activeMetric = metrics.includes(metric)
    ? metric
    : defaultMetric(metrics)
  const series = metricSeries(ordered, activeMetric)
  const stats = featuredStats(latest, contentType)
  const rawMetrics = platformSpecificMetrics(latest)

  async function sync() {
    setSyncing(true)
    try {
      await fetchJsonWithTimeout("/api/analytics/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days: 90,
          integrationIds: [integration.integration_id],
        }),
        timeoutMs: 120_000,
      })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f7fb] px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1380px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/app?view=analytics"
            className="lc-focus-ring inline-flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[12px] font-semibold text-app-muted-text transition hover:bg-app-control-hover hover:text-app-text"
          >
            <IconArrowLeft className="size-4" /> Analytics
          </Link>
          <Button
            variant="softControl"
            size="compact"
            onClick={() => void sync()}
            disabled={syncing}
          >
            <IconRefresh className={cn("size-4", syncing && "animate-spin")} />
            Sync this account
          </Button>
        </header>

        <section className="mt-6 grid gap-5 rounded-[20px] border border-app-panel-border bg-app-surface p-5 shadow-[0_18px_55px_rgba(35,24,67,0.06)] lg:grid-cols-[minmax(0,1fr)_300px] lg:p-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FormatBadge type={contentType} />
              <span className="rounded-full bg-app-surface-subtle px-2.5 py-1 text-[10px] font-semibold text-app-muted-text">
                {providerName(latest.provider)}
              </span>
              <span className="text-[10px] font-medium text-app-text-faint">
                Published {formatDate(latest.publishedAt)}
              </span>
            </div>
            <h1 className="mt-5 max-w-[900px] text-[clamp(25px,3vw,38px)] leading-[1.08] font-semibold tracking-[-0.045em] text-app-text">
              {latest.content || "Post performance"}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-app-panel-border pt-5">
              <AccountProfileIcon integration={integration} size="md" />
              <div>
                <div className="text-[12px] font-semibold text-app-text">
                  {integration.name}
                </div>
                <div className="text-[10px] font-medium text-app-text-faint">
                  Last captured {formatDateTime(latest.capturedAt)}
                </div>
              </div>
              {latest.releaseUrl ? (
                <a
                  href={latest.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="lc-focus-ring ml-auto inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px] font-semibold text-[#6d28d9] transition hover:bg-[#f1eafe]"
                >
                  Open live post <IconExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
          <PostPreview post={latest} type={contentType} />
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-[15px] border border-app-panel-border bg-app-surface p-4"
            >
              <div className="text-[10px] font-semibold text-app-muted-text">
                {stat.label}
              </div>
              <div className="mt-2 text-[27px] leading-none font-semibold tracking-[-0.035em] text-app-text tabular-nums">
                {stat.value}
              </div>
              <div className="mt-2 text-[10px] font-medium text-app-text-faint">
                {stat.note}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-[18px] border border-app-panel-border bg-app-surface p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-app-text">
                Performance over time
              </h2>
              <p className="mt-1 text-[11px] font-medium text-app-muted-text">
                {series.length} stored capture{series.length === 1 ? "" : "s"}.
                Values are cumulative totals reported by the platform.
              </p>
            </div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
              {metrics.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMetric(item)}
                  className={cn(
                    "lc-focus-ring shrink-0 rounded-[8px] px-2.5 py-1.5 text-[10px] font-semibold transition",
                    activeMetric === item
                      ? "bg-app-strong text-app-on-strong"
                      : "bg-app-surface-subtle text-app-muted-text hover:text-app-text"
                  )}
                >
                  {metricLabel(item, latest.provider)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 h-[320px]">
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series}
                  margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="post-metric"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#6d28d9"
                        stopOpacity={0.22}
                      />
                      <stop offset="100%" stopColor="#6d28d9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    width={56}
                    tick={{ fontSize: 10, fill: "#858592" }}
                    tickFormatter={(value) => formatCompact(Number(value))}
                  />
                  <Tooltip content={<MetricTooltip metric={activeMetric} />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#6d28d9"
                    strokeWidth={2.5}
                    fill="url(#post-metric)"
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-[12px] bg-app-surface-subtle px-6 text-center text-[12px] font-medium text-app-text-faint">
                Sync analytics again later to build this post’s performance
                curve.
              </div>
            )}
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[18px] border border-app-panel-border bg-app-surface p-5 lg:p-6">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-app-text">
              Platform-specific metrics
            </h2>
            <p className="mt-1 text-[11px] font-medium text-app-muted-text">
              Raw fields returned by PostFast that do not fit the shared
              cross-platform KPI set.
            </p>
            {rawMetrics.length ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {rawMetrics.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-[11px] bg-app-surface-subtle px-3.5 py-3"
                  >
                    <div className="text-[9px] font-semibold text-app-text-faint">
                      {item.label}
                    </div>
                    <div className="mt-1 text-[16px] font-semibold text-app-text tabular-nums">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[11px] bg-app-surface-subtle px-4 py-7 text-center text-[11px] font-medium text-app-text-faint">
                This provider returned only the shared metrics above.
              </div>
            )}
          </section>

          <aside className="rounded-[18px] border border-app-panel-border bg-app-surface p-5">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-app-text">
              Measurement notes
            </h2>
            <div className="mt-4 space-y-4 text-[11px] leading-5 font-medium text-app-muted-text">
              <p>{formatMeasurementNote(contentType)}</p>
              <p>
                PostFast returns only successfully published posts with a
                platform post ID. Metrics can remain empty until the platform’s
                first refresh completes.
              </p>
            </div>
            <dl className="mt-5 space-y-3 border-t border-app-panel-border pt-4">
              <DetailRow
                label="Post type"
                value={postContentTypeLabel(contentType)}
              />
              <DetailRow label="Snapshots" value={String(ordered.length)} />
              <DetailRow
                label="Source"
                value={latest.sourceType || "external"}
              />
              <DetailRow
                label="Post ID"
                value={latest.platformPostId || latest.postId}
                mono
              />
            </dl>
          </aside>
        </div>
      </div>
    </main>
  )
}

function FormatBadge({ type }: { type: PostContentType }) {
  const Icon = type === "video" ? IconVideo : IconPhoto
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1eafe] px-2.5 py-1 text-[10px] font-semibold text-[#6123bc]">
      <Icon className="size-3.5" /> {postContentTypeLabel(type)}
    </span>
  )
}

function PostPreview({
  post,
  type,
}: {
  post: PostFastMetricSnapshot
  type: PostContentType
}) {
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div
        className={cn(
          "relative overflow-hidden rounded-[14px] bg-[radial-gradient(circle_at_20%_20%,#e5dbf7,transparent_46%),linear-gradient(135deg,#f4f1f8,#e8e5ed)] bg-cover bg-center",
          type === "video" ? "aspect-video lg:aspect-[4/5]" : "aspect-[4/5]"
        )}
        style={
          post.thumbnailUrl
            ? {
                backgroundImage: `url("${post.thumbnailUrl.replace(/"/g, "%22")}")`,
              }
            : undefined
        }
      >
        {!post.thumbnailUrl ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] leading-5 font-semibold text-[#56476e]">
            {(post.content || "Published post").slice(0, 100)}
          </div>
        ) : null}
        <div className="absolute right-2 bottom-2 rounded-[6px] bg-black/65 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">
          {postContentTypeLabel(type)}
          {post.mediaCount ? ` · ${post.mediaCount} media` : ""}
        </div>
      </div>
    </div>
  )
}

function featuredStats(post: PostFastMetricSnapshot, type: PostContentType) {
  const exposureMetric =
    post.metrics.views !== undefined ? "views" : "impressions"
  const common = [
    {
      label: metricLabel(exposureMetric, post.provider),
      value: formatMetric(exposureMetric, post.metrics[exposureMetric]),
      note: "Latest cumulative total",
    },
  ]
  if (type === "video") {
    const averageWatch = rawValue(post.rawMetrics, [
      "avgWatchTimeSeconds",
      "avg_watch_time_seconds",
      "average_watch_time",
    ])
    const completion = rawValue(post.rawMetrics, [
      "full_video_watched_rate",
      "fullVideoWatchedRate",
      "completionRate",
    ])
    return [
      ...common,
      {
        label: "Average watch time",
        value: averageWatch === undefined ? "—" : `${averageWatch.toFixed(2)}s`,
        note: "When the platform reports watch time",
      },
      {
        label: "Completion rate",
        value: formatRawRate(completion),
        note: "Full-video watched rate",
      },
      engagementStat(post),
    ]
  }
  if (type === "slideshow") {
    return [
      ...common,
      canonicalStat(post, "saves", "Save intent"),
      canonicalStat(post, "shares", "Distribution intent"),
      engagementStat(post),
    ]
  }
  return [
    ...common,
    canonicalStat(post, "likes", "Latest cumulative total"),
    canonicalStat(post, "comments", "Latest cumulative total"),
    engagementStat(post),
  ]
}

function canonicalStat(
  post: PostFastMetricSnapshot,
  metric: CanonicalMetric,
  note: string
) {
  return {
    label: metricLabel(metric, post.provider),
    value: formatMetric(metric, post.metrics[metric]),
    note,
  }
}

function engagementStat(post: PostFastMetricSnapshot) {
  return canonicalStat(
    post,
    "engagementRate",
    "Interactions divided by exposure"
  )
}

function availableMetrics(snapshots: PostFastMetricSnapshot[]) {
  return canonicalMetricOrder.filter(
    (metric) =>
      metric !== "followers" &&
      snapshots.some((snapshot) => snapshot.metrics[metric] !== undefined)
  )
}

function defaultMetric(metrics: CanonicalMetric[]): CanonicalMetric {
  if (metrics.includes("views")) return "views"
  if (metrics.includes("impressions")) return "impressions"
  return metrics[0] ?? "interactions"
}

function metricSeries(
  snapshots: PostFastMetricSnapshot[],
  metric: CanonicalMetric
) {
  return snapshots.flatMap((snapshot) => {
    const value = snapshot.metrics[metric]
    return value === undefined
      ? []
      : [
          {
            date: snapshot.capturedAt,
            label: DateTime.fromISO(snapshot.capturedAt).toFormat("d LLL"),
            value,
          },
        ]
  })
}

function platformSpecificMetrics(post: PostFastMetricSnapshot) {
  const hidden = new Set([
    "likes",
    "likeCount",
    "comments",
    "commentCount",
    "shares",
    "shareCount",
    "saves",
    "impressions",
    "reach",
    "totalInteractions",
    "interactions",
  ])
  return Object.entries(post.rawMetrics)
    .filter(([key, value]) => !hidden.has(key) && Number.isFinite(value))
    .sort(
      ([left], [right]) => rawMetricPriority(left) - rawMetricPriority(right)
    )
    .slice(0, 12)
    .map(([key, value]) => ({
      key,
      label: humanizeMetricKey(key),
      value: formatRawMetric(key, value),
    }))
}

function rawMetricPriority(key: string) {
  const order = [
    "avgWatchTimeSeconds",
    "totalWatchTimeSeconds",
    "full_video_watched_rate",
    "videoViews",
    "saveRate",
    "reelsSkipRate",
  ]
  const index = order.indexOf(key)
  return index === -1 ? order.length : index
}

function rawValue(metrics: Record<string, number>, keys: string[]) {
  for (const key of keys) {
    if (Number.isFinite(metrics[key])) return metrics[key]
  }
  return undefined
}

function formatRawMetric(key: string, value: number) {
  const normalized = key.toLowerCase()
  if (normalized.includes("rate") || normalized.includes("percentage")) {
    return formatRawRate(value)
  }
  if (normalized.includes("total") && normalized.includes("time")) {
    return formatDuration(value)
  }
  if (normalized.includes("time") && normalized.includes("second")) {
    return `${value.toFixed(2)}s`
  }
  return formatCompact(value)
}

function formatRawRate(value: number | undefined) {
  if (value === undefined) return "—"
  const percentage = Math.abs(value) <= 1 ? value * 100 : value
  return `${percentage.toFixed(2)}%`
}

function humanizeMetricKey(value: string) {
  const labels: Record<string, string> = {
    avgWatchTimeSeconds: "Average watch time",
    totalWatchTimeSeconds: "Total watch time",
    full_video_watched_rate: "Full-video watched rate",
    videoViews: "Video views",
    saveRate: "Save rate",
    reelsSkipRate: "Reels skip rate",
  }
  if (labels[value]) return labels[value]
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainingSeconds = rounded % 60
  return (
    [
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
      !hours && remainingSeconds ? `${remainingSeconds}s` : "",
    ]
      .filter(Boolean)
      .join(" ") || "0s"
  )
}

function formatMeasurementNote(type: PostContentType) {
  if (type === "slideshow") {
    return "Slideshow analytics are post-level totals. PostFast does not expose per-slide views or slide-by-slide drop-off."
  }
  if (type === "video") {
    return "Video watch-time and completion fields appear only when the connected platform returns them; availability varies by provider and post age."
  }
  return "Availability varies by provider. Unsupported fields are omitted instead of displayed as zero."
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[10px] font-medium text-app-text-faint">{label}</dt>
      <dd
        className={cn(
          "max-w-[220px] text-right text-[10px] font-semibold break-all text-app-text",
          mono && "font-mono"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function MetricTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
  metric: CanonicalMetric
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[8px] border border-app-panel-border bg-white px-3 py-2 shadow-lg">
      <div className="text-[9px] font-medium text-app-text-faint">{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums">
        {formatMetric(metric, payload[0]?.value)}
      </div>
    </div>
  )
}

function formatMetric(metric: CanonicalMetric, value: number | undefined) {
  if (value === undefined) return "—"
  if (metric === "engagementRate") return `${value.toFixed(2)}%`
  return formatCompact(value)
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 2,
  }).format(value)
}

function formatDate(value?: string) {
  if (!value) return "date unavailable"
  return DateTime.fromISO(value).toFormat("d LLL yyyy")
}

function formatDateTime(value: string) {
  return DateTime.fromISO(value).toFormat("d LLL yyyy, h:mm a")
}
