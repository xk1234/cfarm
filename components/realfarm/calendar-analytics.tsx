"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ValueFormatterParams,
} from "ag-grid-community"
import { AgGridReact } from "ag-grid-react"
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
  IconBolt,
  IconBrandFacebookFilled,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconRefresh,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useDismissableLayer } from "@/components/ui/dismissable"
import { SelectControl } from "@/components/ui/form-controls"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { cn } from "@/lib/utils"

type PostFastListedPost = {
  id: string
  content?: string
  scheduledAt?: string
  publishedAt?: string
  createdAt?: string
  sourceId?: string
  sourceType?: string
  socialMediaId?: string
  status?: string
  groupId?: string
  releaseURL?: string
  integration?: {
    id?: string
    providerIdentifier?: string
    name?: string
    picture?: string
  }
}

type PostFastIntegration = {
  id: string
  name?: string
  displayName?: string
  identifier?: string
  platform?: string
  platformUsername?: string
  profile?: string
}

type PostFastMetric = {
  label: string
  data: { date: string; total: string | number }[]
  percentageChange?: number
}

type AnalyticsMetricRow = {
  account: string
  metric: string
  latestTotal: number
  previousTotal: number | null
  changePercent: number | null
  dataPoints: number
  lastUpdated: string
}

type CalendarPostEntry = {
  key: string
  time: string
  color: "pink" | "blue" | "green" | "mint"
  title: string
  channels: {
    provider: string
    status?: string
  }[]
}

ModuleRegistry.registerModules([AllCommunityModule])

export function ContentCalendarView({
  onGoAutomations,
}: {
  onGoAutomations: () => void
}) {
  const [month, setMonth] = useState(() =>
    DateTime.now().startOf("month").toJSDate()
  )
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    DateTime.now().toJSDate()
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useDismissableLayer<HTMLDivElement>(
    () => setFilterOpen(false),
    filterOpen
  )
  const [postfastPosts, setPostFastPosts] = useState<PostFastListedPost[]>([])
  const [postfastConfigured, setPostFastConfigured] = useState(true)
  const [filters, setFilters] = useState({
    scheduled: true,
  })
  const monthDate = useMemo(
    () => DateTime.fromJSDate(month).startOf("month"),
    [month]
  )
  const monthEnd = useMemo(() => monthDate.endOf("month"), [monthDate])
  const monthRangeKey = useMemo(() => {
    const startDate = monthDate.toUTC().toISO() ?? ""
    const endDate = monthEnd.toUTC().toISO() ?? ""
    return `/api/postfast/posts?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  }, [monthDate, monthEnd])
  const gridStart = monthDate.startOf("week").minus({ days: 1 })
  const calendarWeeks = Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) =>
      gridStart.plus({ days: weekIndex * 7 + dayIndex + 1 })
    )
  )
  const hasContent = postfastPosts.some(hasCalendarTimestamp)

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{
      posts?: { posts?: PostFastListedPost[] }
      configured?: boolean
    }>(monthRangeKey)
      .then((payload) => {
        if (!active) {
          return
        }
        setPostFastConfigured(payload?.configured !== false)
        setPostFastPosts(payload?.posts?.posts ?? [])
      })
      .catch(() => {
        if (active) {
          setPostFastConfigured(false)
          setPostFastPosts([])
        }
      })

    return () => {
      active = false
    }
  }, [monthRangeKey])

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-semibold tracking-normal">
          Content Calendar
        </h1>
        <div className="flex items-center gap-3">
          <div ref={filterRef} className="relative">
            <Button
              variant="softControl"
              size="compact"
              onClick={() => setFilterOpen((current) => !current)}
            >
              <IconFilter className="size-3.5" />
              Filter
            </Button>
            {filterOpen && (
              <div className="absolute top-10 right-0 z-30 w-[170px] rounded-[7px] border border-[#e5e4dc] bg-white p-2 text-[12px] font-semibold shadow-xl">
                <CalendarFilterCheckbox
                  label="Scheduled Posts"
                  checked={filters.scheduled}
                  onChange={() =>
                    setFilters((current) => ({
                      ...current,
                      scheduled: !current.scheduled,
                    }))
                  }
                />
              </div>
            )}
          </div>
          <Button
            variant="iconControl"
            size="icon-control-sm"
            onClick={() => setMonth(monthDate.minus({ months: 1 }).toJSDate())}
            aria-label="Previous month"
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            variant="iconControl"
            size="icon-control-sm"
            onClick={() => setMonth(monthDate.plus({ months: 1 }).toJSDate())}
            aria-label="Next month"
          >
            <IconChevronRight className="size-4" />
          </Button>
          <div className="min-w-[112px] px-1 text-right text-[14px] font-semibold text-[#242421]">
            {monthDate.toFormat("LLL yyyy")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[#e5e4dc] text-[11px] font-semibold text-[#77766f]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="px-3 pb-4">
            {day}
          </div>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-b-[3px] border-x border-[#e5e4dc] bg-[#fbfbf7]">
        {calendarWeeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="grid grid-cols-7 border-b border-[#e5e4dc] last:border-b-0"
          >
            {week.map((day, dayIndex) => {
              const isToday = selectedDate
                ? day.hasSame(DateTime.fromJSDate(selectedDate), "day")
                : false
              const isMuted = !day.hasSame(monthDate, "month")
              const posts =
                hasContent && !isMuted && filters.scheduled
                  ? postsForDay(postfastPosts, day)
                  : []

              return (
                <button
                  key={`${weekIndex}-${dayIndex}`}
                  className="min-h-[118px] border-r border-[#e5e4dc] bg-[#fdfdf9] p-2 text-left last:border-r-0"
                  onClick={() => setSelectedDate(day.toJSDate())}
                >
                  <div
                    className={cn(
                      "mb-3 flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                      isToday
                        ? "bg-app-action text-white"
                        : isMuted
                          ? "text-[#9d9c95]"
                          : "text-[#77766f]"
                    )}
                  >
                    {day.day}
                  </div>
                  <div className="space-y-1">
                    {posts.map((post) => (
                      <CalendarPost key={post.key} post={post} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
        {!hasContent && (
          <div className="absolute top-[34%] left-1/2 w-[330px] -translate-x-1/2 rounded-[4px] bg-white px-7 py-5 text-center shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
            <div className="text-[13px] font-bold text-[#242421]">
              {postfastConfigured
                ? "No PostFast posts yet"
                : "PostFast is not configured"}
            </div>
            <p className="mt-2 text-[12px] font-medium text-[#77766f]">
              {postfastConfigured
                ? "Schedule posts on an added social account to populate this calendar."
                : "Add POSTFAST_API_KEY and connect a social account to sync scheduled posts."}
            </p>
            <Button
              variant="action"
              size="appDefault"
              className="mt-4"
              onClick={onGoAutomations}
            >
              Go to automations
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function CalendarFilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 hover:bg-[#f5f5f1]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-3.5 accent-app-action"
      />
      {label}
    </label>
  )
}

function CalendarPost({ post }: { post: CalendarPostEntry }) {
  return (
    <div
      className={cn(
        "flex h-6 items-center gap-1 overflow-hidden rounded-[2px] px-1.5 text-[10px] font-semibold text-[#4d4c47]",
        post.color === "pink" && "bg-[#f7d1ef]",
        post.color === "blue" && "bg-[#d9e8fb]",
        post.color === "green" && "bg-[#d8f5bd]",
        post.color === "mint" && "bg-[#cdf7e0]"
      )}
    >
      {post.channels.map((channel, index) => (
        <PlatformStatusIcon
          key={`${channel.provider}-${index}`}
          provider={channel.provider}
          status={channel.status}
        />
      ))}
      <span className="min-w-[44px] shrink-0">{post.time}</span>
      <span className="truncate">{post.title}</span>
    </div>
  )
}

function PlatformStatusIcon({
  provider,
  status,
}: {
  provider: string
  status?: string
}) {
  const iconClassName = cn(
    "size-2.5",
    provider === "x" || provider === "twitter"
      ? "text-[#111]"
      : provider === "youtube"
        ? "text-[#d82020]"
        : provider === "facebook"
          ? "text-[#1877f2]"
          : "text-[#111]"
  )

  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full border-2 bg-white",
        statusBorderClass(status)
      )}
      title={`${provider} ${status ?? ""}`.trim()}
    >
      <PlatformGlyph provider={provider} className={iconClassName} />
    </span>
  )
}

function PlatformGlyph({
  provider,
  className,
}: {
  provider: string
  className?: string
}) {
  switch (provider) {
    case "youtube":
      return <IconBrandYoutubeFilled className={className} />
    case "facebook":
      return <IconBrandFacebookFilled className={className} />
    case "x":
    case "twitter":
      return <IconBrandX className={className} />
    case "tiktok":
    default:
      return <IconBrandTiktok className={className} />
  }
}

function postsForDay(
  posts: PostFastListedPost[],
  day: DateTime
): CalendarPostEntry[] {
  const groups = new Map<
    string,
    {
      date: DateTime
      title: string
      channels: CalendarPostEntry["channels"]
    }
  >()

  for (const post of posts) {
    const postDate = postCalendarDate(post)
    if (!postDate?.isValid || !postDate.hasSame(day, "day")) {
      continue
    }

    const key = `${calendarSourceKey(post)}:${postDate.toISODate()}:${postDate.toFormat("HH:mm")}`
    const group = groups.get(key) ?? {
      date: postDate,
      title: calendarPostTitle(post),
      channels: [],
    }
    const provider = postProvider(post)
    if (
      !group.channels.some(
        (channel) =>
          channel.provider === provider && channel.status === post.status
      )
    ) {
      group.channels.push({ provider, status: post.status })
    }
    groups.set(key, group)
  }

  return Array.from(groups.entries())
    .sort(
      ([, first], [, second]) => first.date.toMillis() - second.date.toMillis()
    )
    .map(([key, group], index) => ({
      key,
      time: group.date.toFormat("h:mm a"),
      color: calendarColors[index % calendarColors.length],
      title: group.title,
      channels: group.channels,
    }))
}

const calendarColors = ["pink", "blue", "green", "mint"] as const

function hasCalendarTimestamp(post: PostFastListedPost) {
  return Boolean(postCalendarDate(post)?.isValid)
}

function postCalendarDate(post: PostFastListedPost) {
  const value = post.publishedAt || post.scheduledAt
  return value ? DateTime.fromISO(value) : null
}

function calendarSourceKey(post: PostFastListedPost) {
  return (
    canonicalSourceId(post.sourceId) ||
    post.groupId ||
    post.releaseURL ||
    post.id
  )
}

function canonicalSourceId(sourceId: string | undefined) {
  if (!sourceId) {
    return ""
  }
  return sourceId.replace(/:(tiktok|youtube|x|twitter|facebook):[^:]+$/i, "")
}

function calendarPostTitle(post: PostFastListedPost) {
  return post.content?.trim() || post.sourceType || "PostFast post"
}

function postProvider(post: PostFastListedPost) {
  return (
    post.integration?.providerIdentifier ||
    post.socialMediaId ||
    "postfast"
  ).toLowerCase()
}

function statusBorderClass(status: string | undefined) {
  switch (status?.toUpperCase()) {
    case "PUBLISHED":
    case "POSTED":
      return "border-[#31a960]"
    case "SCHEDULED":
      return "border-[#4c7de8]"
    case "DRAFT":
      return "border-[#9b9a93]"
    case "FAILED":
      return "border-[#d75454]"
    default:
      return "border-[#d8d7cf]"
  }
}

export function AnalyticsView() {
  const [range, setRange] = useState(30)
  const [integrations, setIntegrations] = useState<PostFastIntegration[]>([])
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("")
  const [metrics, setMetrics] = useState<PostFastMetric[]>([])
  const [error, setError] = useState("")
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ integrations?: PostFastIntegration[] }>(
      "/api/postfast/integrations"
    )
      .then((payload) => {
        if (!active) {
          return
        }
        const nextIntegrations = payload?.integrations ?? []
        setIntegrations(nextIntegrations)
        setSelectedIntegrationId(
          (current) => current || nextIntegrations[0]?.id || ""
        )
      })
      .catch((integrationsError) => {
        if (active) {
          setIntegrations([])
          setError(
            getApiErrorMessage(integrationsError, "PostFast is not configured")
          )
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedIntegrationId) {
      return
    }

    let active = true
    void fetchJsonWithTimeout<{ analytics?: PostFastMetric[] }>(
      `/api/postfast/analytics/platform?integrationId=${encodeURIComponent(selectedIntegrationId)}&days=${range}`
    )
      .then((payload) => {
        if (active) {
          setMetrics(payload.analytics ?? [])
          setError("")
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(getApiErrorMessage(nextError, "PostFast analytics failed"))
          setMetrics([])
        }
      })

    return () => {
      active = false
    }
  }, [range, refreshTick, selectedIntegrationId])

  const visibleMetrics = useMemo(
    () => (selectedIntegrationId ? metrics : []),
    [metrics, selectedIntegrationId]
  )
  const selectedIntegration = useMemo(
    () =>
      integrations.find(
        (integration) => integration.id === selectedIntegrationId
      ) ?? null,
    [integrations, selectedIntegrationId]
  )
  const selectedAccountName = selectedIntegration
    ? selectedIntegration.displayName ||
      selectedIntegration.name ||
      selectedIntegration.platformUsername ||
      selectedIntegration.profile ||
      selectedIntegration.platform ||
      selectedIntegration.identifier ||
      selectedIntegration.id
    : "No social account"
  const primaryMetric = useMemo(
    () =>
      visibleMetrics.find((metric) => /view|impression/i.test(metric.label)) ??
      visibleMetrics[0],
    [visibleMetrics]
  )
  const chartData = useMemo(() => {
    const end = DateTime.now()
    return Array.from({ length: range }, (_, index) => {
      const day = end.minus({ days: range - index - 1 })
      const point = primaryMetric?.data.find((item) =>
        DateTime.fromISO(item.date).hasSame(day, "day")
      )
      return {
        date: day.toFormat("M/d"),
        views: Number(point?.total ?? 0),
      }
    })
  }, [primaryMetric, range])
  const analyticsRows = useMemo(
    () =>
      visibleMetrics.map((metric) =>
        analyticsMetricRow(metric, selectedAccountName)
      ),
    [selectedAccountName, visibleMetrics]
  )
  const analyticsColumns = useMemo<ColDef<AnalyticsMetricRow>[]>(
    () => [
      { field: "account", headerName: "Account", minWidth: 180, flex: 1.2 },
      { field: "metric", headerName: "Metric", minWidth: 180, flex: 1.1 },
      {
        field: "latestTotal",
        headerName: "Latest Total",
        minWidth: 140,
        type: "numericColumn",
        valueFormatter: numberCellFormatter,
      },
      {
        field: "previousTotal",
        headerName: "Previous Total",
        minWidth: 150,
        type: "numericColumn",
        valueFormatter: nullableNumberCellFormatter,
      },
      {
        field: "changePercent",
        headerName: "Change",
        minWidth: 130,
        type: "numericColumn",
        valueFormatter: percentCellFormatter,
        cellClass: (params) => {
          const value = params.value
          if (typeof value !== "number" || value === 0) {
            return "text-[#77766f]"
          }
          return value > 0 ? "text-[#238c4c]" : "text-[#c34236]"
        },
      },
      {
        field: "dataPoints",
        headerName: "Points",
        minWidth: 110,
        type: "numericColumn",
        valueFormatter: numberCellFormatter,
      },
      {
        field: "lastUpdated",
        headerName: "Last Updated",
        minWidth: 150,
        flex: 0.9,
      },
    ],
    []
  )
  const defaultAnalyticsColumn = useMemo<ColDef<AnalyticsMetricRow>>(
    () => ({
      filter: true,
      resizable: true,
      sortable: true,
    }),
    []
  )

  return (
    <div className="mx-auto max-w-[1220px]">
      <div className="mb-14 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-normal">
            Analytics
          </h1>
          <p className="mt-2 max-w-[420px] text-[14px] leading-5 font-medium text-[#77766f]">
            Track your TikTok performance and engagement metrics
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="softControl"
            size="appDefault"
            onClick={() => setRefreshTick((current) => current + 1)}
          >
            <IconRefresh className="size-5" />
            Refresh
          </Button>
          <SelectControl
            value={range}
            onChange={(event) => setRange(Number(event.target.value))}
          >
            {[7, 30, 60, 90].map((value) => (
              <option key={value} value={value}>
                {value} days
              </option>
            ))}
          </SelectControl>
          <SelectControl
            className="max-w-[240px]"
            value={selectedIntegrationId}
            onChange={(event) => setSelectedIntegrationId(event.target.value)}
          >
            <option value="">No social account</option>
            {integrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.displayName ||
                  integration.name ||
                  integration.platformUsername ||
                  integration.profile ||
                  integration.platform ||
                  integration.identifier ||
                  integration.id}
              </option>
            ))}
          </SelectControl>
        </div>
      </div>

      <section className="rounded-[14px] border border-[#e1e0d8] bg-white p-8 shadow-sm">
        <h2 className="mb-5 flex items-center gap-3 text-[26px] font-bold">
          <IconBolt className="size-6 text-[#77766f]" />
          {primaryMetric?.label ?? "Daily Views"} (Last {range} Days)
        </h2>
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
            >
              <CartesianGrid stroke="#e6e5de" strokeDasharray="4 4" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(range / 12))}
              />
              <YAxis tickLine={false} axisLine={false} domain={[0, 4]} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="views"
                stroke="var(--app-action)"
                fill="var(--app-action)"
                fillOpacity={0.08}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-10 overflow-hidden rounded-[10px] border border-[#e1e0d8] bg-white shadow-sm">
        <div className="h-[360px] min-w-0">
          <AgGridReact<AnalyticsMetricRow>
            className="realfarm-analytics-grid ag-theme-quartz h-full w-full"
            theme="legacy"
            rowData={analyticsRows}
            columnDefs={analyticsColumns}
            defaultColDef={defaultAnalyticsColumn}
            animateRows
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            suppressCellFocus
            overlayNoRowsTemplate={`<span class="text-[15px] font-semibold text-[#77766f]">${error || "No PostFast analytics yet"}</span>`}
          />
        </div>
      </section>
    </div>
  )
}

function analyticsMetricRow(
  metric: PostFastMetric,
  account: string
): AnalyticsMetricRow {
  const sortedData = [...metric.data].sort(
    (first, second) =>
      DateTime.fromISO(first.date).toMillis() -
      DateTime.fromISO(second.date).toMillis()
  )
  const latestPoint = sortedData.at(-1)
  const previousPoint = sortedData.at(-2)
  const latestTotal = numericMetricTotal(latestPoint?.total)
  const previousTotal = previousPoint
    ? numericMetricTotal(previousPoint.total)
    : null

  return {
    account,
    metric: metric.label,
    latestTotal,
    previousTotal,
    changePercent:
      typeof metric.percentageChange === "number"
        ? metric.percentageChange
        : percentChange(previousTotal, latestTotal),
    dataPoints: sortedData.length,
    lastUpdated: latestPoint
      ? DateTime.fromISO(latestPoint.date).toFormat("LLL d, yyyy")
      : "",
  }
}

function numericMetricTotal(value: string | number | undefined) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function percentChange(previousTotal: number | null, latestTotal: number) {
  if (previousTotal === null || previousTotal === 0) {
    return null
  }
  return ((latestTotal - previousTotal) / previousTotal) * 100
}

function numberCellFormatter(
  params: ValueFormatterParams<AnalyticsMetricRow, number>
) {
  return formatAnalyticsNumber(params.value)
}

function nullableNumberCellFormatter(
  params: ValueFormatterParams<AnalyticsMetricRow, number | null>
) {
  return params.value === null ? "" : formatAnalyticsNumber(params.value)
}

function percentCellFormatter(
  params: ValueFormatterParams<AnalyticsMetricRow, number | null>
) {
  const value = params.value
  return typeof value === "number"
    ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
    : ""
}

function formatAnalyticsNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return ""
  }
  return new Intl.NumberFormat("en").format(value)
}
