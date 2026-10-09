"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DateTime } from "luxon"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconArrowLeft,
  IconBrandTiktok,
  IconExternalLink,
  IconPhoto,
  IconVideo,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AccountProfileIcon,
  providerName,
} from "@/components/realfarm/analytics/account-profile-icon"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/client-api"
import {
  canonicalMetricOrder,
  metricLabel,
  type CanonicalMetric,
} from "@/lib/metric-registry"
import {
  postContentTypeLabel,
  type PostContentType,
} from "@/lib/post-content-type"
import type { SocialIntegration } from "@/lib/social/provider-contract"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import {
  collectTikTokCommentsForPublication,
  TIKTOK_PLATFORM_POST_ID_REQUIRED,
} from "@/lib/tiktok-comment-collection-client"
import { cn } from "@/lib/utils"
import { postPerformanceSeries } from "./analytics-selectors"
import { PostSlidesStrip, type AnalyticsSlide } from "./post-slides-strip"
import { TikTokStudioImportDialog } from "./tiktok-studio-import-dialog"

export function PostAnalyticsPage({
  snapshots,
  integration,
  contentType,
  publicationPlatformPostId,
  slides = [],
  autoCollectComments = false,
}: {
  snapshots: PostFastMetricSnapshot[]
  integration: SocialIntegration
  contentType: PostContentType
  publicationPlatformPostId?: string
  slides?: AnalyticsSlide[]
  autoCollectComments?: boolean
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
  const activeMetric = metrics.includes(metric)
    ? metric
    : defaultMetric(metrics)
  const usesStudioViewHistory =
    (activeMetric === "views" || activeMetric === "impressions") &&
    ordered.some(
      (snapshot) =>
        (snapshot.tiktokStudio?.viewHistory7d?.length ?? 0) > 0 ||
        (snapshot.tiktokStudio?.viewHistory48h?.length ?? 0) > 0
    )
  const series = postPerformanceSeries(ordered, activeMetric)
  const stats = featuredStats(latest, contentType)
  const rawMetrics = platformSpecificMetrics(latest)
  const studioSnapshot = [...ordered]
    .reverse()
    .find((snapshot) => snapshot.tiktokStudio)
  const studio = studioSnapshot?.tiktokStudio
  const isTikTok = latest.provider.toLowerCase().startsWith("tiktok")
  const platformPostId =
    publicationPlatformPostId?.trim() ||
    [...ordered].reverse().find((snapshot) => snapshot.platformPostId?.trim())
      ?.platformPostId
  const [companionStatus, setCompanionStatus] = useState<
    "" | "connecting" | "connected" | "error"
  >(
    autoCollectComments
      ? isTikTok && platformPostId
        ? "connecting"
        : "error"
      : ""
  )
  const autoCollectionStarted = useRef(false)
  const [studioImportOpen, setStudioImportOpen] = useState(false)

  useEffect(() => {
    if (!autoCollectComments || autoCollectionStarted.current) {
      return
    }
    autoCollectionStarted.current = true
    if (!isTikTok || !platformPostId) {
      return
    }
    void collectTikTokCommentsForPublication({
      id: latest.postId,
      platformPostId,
    })
      .then(() => {
        toast.success("Comment collection sent to the TikTok extension")
        setCompanionStatus("connected")
      })
      .catch((error) => {
        toast.error(
          getApiErrorMessage(error, "TikTok comments could not be collected")
        )
        setCompanionStatus("error")
      })
      .finally(() => {
        router.replace(
          `/app/analytics/posts/${encodeURIComponent(latest.postId)}`
        )
      })
  }, [autoCollectComments, isTikTok, latest.postId, platformPostId, router])

  return (
    <main className="min-h-screen bg-[#f8f7fb] px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1380px]">
        <header>
          <Link
            href="/app?view=analytics"
            className="lc-focus-ring inline-flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[12px] font-semibold text-app-muted-text transition hover:bg-app-control-hover hover:text-app-text"
          >
            <IconArrowLeft className="size-4" /> Analytics
          </Link>
        </header>

        {companionStatus ? (
          <div
            role="status"
            className={cn(
              "mt-5 rounded-[10px] border px-4 py-3 text-[12px] leading-5 font-semibold",
              companionStatus === "error"
                ? "border-app-danger/25 bg-app-danger-surface text-app-danger"
                : companionStatus === "connected"
                  ? "border-app-success/25 bg-app-success-surface text-app-success"
                  : "border-app-panel-border bg-app-surface text-app-muted-text"
            )}
          >
            {companionStatus === "connecting"
              ? "Connecting this video to the Chrome companion and starting comment capture…"
              : companionStatus === "connected"
                ? "This video is connected. Keep TikTok open while the companion captures its comments."
                : !platformPostId
                  ? TIKTOK_PLATFORM_POST_ID_REQUIRED
                  : "The Chrome companion could not be reached. Reload or reinstall the extension, then reopen this post from TikTok."}
          </div>
        ) : null}

        <section className="mt-6 grid gap-5 rounded-[20px] border border-app-panel-border bg-app-surface p-5 shadow-[0_18px_55px_rgba(35,24,67,0.06)] lg:grid-cols-[minmax(0,1fr)_300px] lg:p-7">
          <div className="min-w-0">
            <h1 className="max-w-[900px] text-[clamp(25px,3vw,38px)] leading-[1.08] font-semibold tracking-[-0.045em] text-app-text">
              {latest.content || "Post performance"}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <FormatBadge type={contentType} />
              <span className="rounded-full bg-app-surface-subtle px-2.5 py-1 text-[10px] font-semibold text-app-muted-text">
                {providerName(latest.provider)}
              </span>
              <span className="text-[10px] font-medium text-app-text-faint">
                Published {formatDate(latest.publishedAt)}
              </span>
            </div>
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

        <PostSlidesStrip slides={slides} />

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
                {usesStudioViewHistory
                  ? "TikTok Studio views since posted"
                  : "Performance over time"}
              </h2>
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

        {studio ? (
          <TikTokStudioBreakdown studio={studio} />
        ) : isTikTok ? (
          <MissingTikTokStudioAnalytics
            onImport={() => setStudioImportOpen(true)}
          />
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[18px] border border-app-panel-border bg-app-surface p-5 lg:p-6">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-app-text">
              Platform-specific metrics
            </h2>
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
              <p>{formatMeasurementNote(contentType, Boolean(studio))}</p>
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
                value={platformPostId || latest.postId}
                mono
              />
            </dl>
          </aside>
        </div>
      </div>
      {studioImportOpen ? (
        <TikTokStudioImportDialog
          postId={latest.postId}
          onClose={() => setStudioImportOpen(false)}
          onLinked={() => {
            router.refresh()
            setStudioImportOpen(false)
          }}
        />
      ) : null}
    </main>
  )
}

function MissingTikTokStudioAnalytics({ onImport }: { onImport: () => void }) {
  return (
    <section className="mt-5 rounded-[18px] border border-app-panel-border bg-app-surface p-5 lg:p-6">
      <div className="flex items-center gap-2">
        <IconBrandTiktok className="size-4 text-app-text" />
        <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-app-text">
          TikTok Studio analytics
        </h2>
      </div>
      <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-[13px] bg-app-surface-subtle px-4 py-4 sm:flex-row sm:items-center">
        <p className="max-w-2xl text-[11px] leading-5 font-medium text-app-muted-text">
          No Studio analytics have been imported for this post yet. Import them
          to add slide retention, traffic sources, search discovery, and viewer
          breakdowns.
        </p>
        <Button
          variant="softControl"
          size="compact"
          className="shrink-0"
          onClick={onImport}
        >
          Import analytics
        </Button>
      </div>
    </section>
  )
}

function TikTokStudioBreakdown({
  studio,
}: {
  studio: NonNullable<PostFastMetricSnapshot["tiktokStudio"]>
}) {
  const slideData = studio.slides.map((slide) => ({
    name: `Slide ${slide.slideIndex}`,
    retention: percentageValue(slide.retentionPercent),
    likes: percentageValue(slide.likeDistributionPercent),
  }))
  const hasLikeData = slideData.some((slide) => slide.likes !== undefined)
  const trafficRows = percentageRows(studio.trafficSources, 7)
  const countryRows = percentageRows(studio.audience?.countryPercent ?? {}, 5)
  const searchRows = studio.searchTerms.slice(0, 5).map((item) => ({
    label: item.term,
    value: percentageValue(item.percent) ?? 0,
  }))
  return (
    <section className="mt-5 rounded-[18px] border border-app-panel-border bg-app-surface p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <IconBrandTiktok className="size-4 text-app-text" />
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-app-text">
              Slideshow journey
            </h2>
          </div>
        </div>
        <span className="rounded-full bg-app-surface-subtle px-2.5 py-1 text-[9px] font-semibold text-app-muted-text">
          {studio.capturedSections.join(" · ")}
        </span>
      </div>

      {slideData.length > 0 ? (
        <div className="mt-5 rounded-[14px] border border-app-panel-border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[12px] font-semibold text-app-text">
              Slide performance
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-medium text-app-muted-text">
              <ChartLegend color="#6d28d9" label="Still viewing" />
              {hasLikeData ? (
                <ChartLegend color="#ef4f91" label="Share of likes" />
              ) : null}
            </div>
          </div>
          <div className="mt-3 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={slideData}
                margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
                barGap={5}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#eceaf1"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#858592" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  tick={{ fontSize: 10, fill: "#858592" }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<StudioPercentTooltip />} />
                <Bar
                  dataKey="retention"
                  name="Still viewing"
                  fill="#6d28d9"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={58}
                  isAnimationActive={false}
                />
                {hasLikeData ? (
                  <Bar
                    dataKey="likes"
                    name="Share of likes"
                    fill="#ef4f91"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={58}
                    isAnimationActive={false}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <RankedBarChart
          title="Traffic sources"
          rows={trafficRows}
          color="#6d28d9"
        />
        <RankedBarChart
          title="Viewer countries"
          rows={countryRows}
          color="#267d6f"
          emptyMessage="Open the matching Studio tab to capture this breakdown."
        />
        <RankedBarChart
          title="Search discovery"
          rows={searchRows}
          color="#d94687"
          emptyMessage="No search-query detail captured."
        />
      </div>
    </section>
  )
}

function ChartLegend({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  )
}

function RankedBarChart({
  title,
  rows,
  color,
  emptyMessage = "No data captured.",
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  color: string
  emptyMessage?: string
}) {
  return (
    <div className="rounded-[13px] border border-app-panel-border p-4">
      <div className="text-[11px] font-semibold text-app-text">{title}</div>
      {rows.length > 0 ? (
        <div
          className="mt-3"
          style={{ height: Math.max(170, rows.length * 31) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
              barCategoryGap="24%"
            >
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fontSize: 9, fill: "#666674" }}
              />
              <Tooltip content={<StudioPercentTooltip />} />
              <Bar
                dataKey="value"
                name={title}
                fill={color}
                radius={[0, 5, 5, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-app-text text-[9px] font-semibold"
                  formatter={chartPercentLabel}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 text-[10px] font-medium text-app-text-faint">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}

function StudioPercentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ color?: string; name?: string; value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[8px] border border-app-panel-border bg-white px-3 py-2 shadow-lg">
      <div className="text-[9px] font-medium text-app-text-faint">{label}</div>
      <div className="mt-1.5 space-y-1">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4 text-[10px]"
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-app-muted-text">
              <span
                className="size-2 rounded-[2px]"
                style={{ background: item.color }}
              />
              {item.name}
            </span>
            <span className="font-semibold text-app-text tabular-nums">
              {chartPercentLabel(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function percentageRows(values: Record<string, number>, limit: number) {
  return Object.entries(values)
    .map(([label, value]) => ({
      label,
      value: percentageValue(value) ?? 0,
    }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
}

function percentageValue(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.abs(value) <= 1 ? value * 100 : value
}

function chartPercentLabel(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "—"
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

function formatMeasurementNote(type: PostContentType, hasStudio = false) {
  if (type === "slideshow") {
    return hasStudio
      ? "Post totals come from the latest provider capture. Per-slide retention and like distribution come from the linked TikTok Studio snapshot."
      : "PostFast exposes only post-level slideshow totals. Import the linked post from TikTok Studio to add per-slide retention and like distribution."
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
