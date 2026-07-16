"use client"

import { useEffect, useMemo, useState } from "react"
import { DateTime } from "luxon"
import {
  IconBrandBluesky,
  IconBrandFacebookFilled,
  IconBrandGoogleFilled,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutubeFilled,
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconFilter,
  IconLoader2,
  IconRefresh,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import type {
  CalendarItem,
  CalendarLifecycleStatus,
} from "@/lib/calendar-items"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"
import { cn } from "@/lib/utils"

type CalendarPayload = {
  items: CalendarItem[]
  summary: { needsAction: number; failed: number; planned: number }
}

type CalendarFilters = {
  accounts: string[]
  statuses: CalendarLifecycleStatus[]
  platform: string
  automation: string
  sourceType: string
}

const filterStorageKey = "realfarm:calendar-filters:v1"
const defaultFilters: CalendarFilters = {
  accounts: [],
  statuses: [],
  platform: "all",
  automation: "all",
  sourceType: "all",
}
const lifecycleOptions: Array<{
  value: CalendarLifecycleStatus
  label: string
}> = [
  { value: "planned", label: "Planned" },
  { value: "generating", label: "Generating" },
  { value: "generation_failed", label: "Generation failed" },
  { value: "needs_action", label: "Needs action" },
  { value: "draft", label: "Draft" },
  { value: "failed", label: "Failed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
]

export function ContentCalendarView({
  onGoAutomations,
}: {
  onGoAutomations: () => void
}) {
  const [month, setMonth] = useState<DateTime<boolean>>(() => DateTime.local())
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
  const [filters, setFilters] = useState<CalendarFilters>(defaultFilters)
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  const range = monthRange(month)
  const requestKey = `/api/calendar?from=${encodeURIComponent(range.from.toUTC().toISO() ?? "")}&to=${encodeURIComponent(range.to.toUTC().toISO() ?? "")}`
  const { data, error, isLoading, mutate } = useSWR<CalendarPayload>(
    requestKey,
    clientSWRFetcher,
    { keepPreviousData: true }
  )

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(filterStorageKey)
      if (stored) setFilters(normalizeStoredFilters(JSON.parse(stored)))
    } catch {
      // Ignore unavailable or malformed browser storage.
    } finally {
      setFiltersHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!filtersHydrated) return
    window.localStorage.setItem(filterStorageKey, JSON.stringify(filters))
  }, [filters, filtersHydrated])

  const items = useMemo(() => data?.items ?? [], [data?.items])
  const accounts = useMemo(() => accountOptions(items), [items])
  const platforms = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) => item.targets.map((target) => target.provider))
        ),
      ]
        .filter(Boolean)
        .sort(),
    [items]
  )
  const automations = useMemo(
    () =>
      [
        ...new Map(
          items.flatMap((item) =>
            item.automationId
              ? [
                  [
                    item.automationId,
                    item.automationName || "Automation",
                  ] as const,
                ]
              : []
          )
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [items]
  )
  const sourceTypes = useMemo(
    () => [...new Set(items.map((item) => item.sourceType))].sort(),
    [items]
  )
  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilters(item, filters)),
    [filters, items]
  )
  const visibleSummary = useMemo(
    () => ({
      needsAction: visibleItems.filter((item) => item.status === "needs_action")
        .length,
      failed: visibleItems.filter((item) => isFailed(item.status)).length,
      planned: visibleItems.filter((item) => item.status === "planned").length,
    }),
    [visibleItems]
  )

  return (
    <div className="mx-auto max-w-[1380px] pb-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-app-muted-text">
            <IconCalendar className="size-4" /> Planning workspace
          </div>
          <h1 className="text-[30px] leading-none font-semibold tracking-[-0.035em] text-[#20201d]">
            Content calendar
          </h1>
          <p className="mt-3 max-w-[620px] text-[14px] leading-6 font-medium text-app-muted-text">
            Planned slots, generation work, manual tasks, scheduled posts, and
            failures across every account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="softControl"
            size="compact"
            onClick={() => void mutate()}
            disabled={isLoading}
          >
            <IconRefresh
              className={cn("size-4", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
          <Button variant="action" size="compact" onClick={onGoAutomations}>
            <IconSparkles className="size-4" /> Automations
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-2 sm:grid-cols-3">
        <SummaryCard
          label="Needs action"
          value={visibleSummary.needsAction}
          tone="amber"
        />
        <SummaryCard
          label="Failures"
          value={visibleSummary.failed}
          tone="red"
        />
        <SummaryCard
          label="Planned slots"
          value={visibleSummary.planned}
          tone="neutral"
        />
      </section>

      <section className="mb-4 rounded-[12px] border border-app-panel-border bg-app-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-app-muted-text">
            <IconFilter className="size-4" /> Filters
          </span>
          <MultiSelectFilter
            label="Accounts"
            options={accounts}
            selected={filters.accounts}
            onChange={(accounts) =>
              setFilters((current) => ({ ...current, accounts }))
            }
          />
          <SelectControl
            value={filters.platform}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                platform: event.target.value,
              }))
            }
          >
            <option value="all">All platforms</option>
            {platforms.map((provider) => (
              <option key={provider} value={provider}>
                {providerLabel(provider)}
              </option>
            ))}
          </SelectControl>
          <MultiSelectFilter
            label="Lifecycle"
            options={lifecycleOptions.map((option) => [
              option.value,
              option.label,
            ])}
            selected={filters.statuses}
            onChange={(statuses) =>
              setFilters((current) => ({
                ...current,
                statuses: statuses as CalendarLifecycleStatus[],
              }))
            }
          />
          <SelectControl
            value={filters.automation}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                automation: event.target.value,
              }))
            }
          >
            <option value="all">All automations</option>
            {automations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </SelectControl>
          <SelectControl
            value={filters.sourceType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sourceType: event.target.value,
              }))
            }
          >
            <option value="all">All sources</option>
            {sourceTypes.map((sourceType) => (
              <option key={sourceType} value={sourceType}>
                {humanize(sourceType)}
              </option>
            ))}
          </SelectControl>
          {hasFilters(filters) ? (
            <button
              type="button"
              onClick={() => setFilters(defaultFilters)}
              className="lc-focus-ring ml-auto inline-flex h-9 items-center gap-1 rounded-[7px] px-2.5 text-[12px] font-semibold text-app-muted-text transition hover:bg-app-surface-subtle hover:text-app-text"
            >
              <IconX className="size-3.5" /> Clear
            </button>
          ) : null}
        </div>
      </section>

      <div className="mb-4 flex items-center justify-between rounded-[12px] bg-app-surface-subtle p-2">
        <Button
          variant="iconControl"
          size="icon-control-sm"
          onClick={() => setMonth((current) => current.minus({ months: 1 }))}
          aria-label="Previous month"
        >
          <IconChevronLeft className="size-4" />
        </Button>
        <button
          type="button"
          className="lc-focus-ring rounded-[7px] px-4 py-1.5 text-[14px] font-semibold text-app-text"
          onClick={() => setMonth(DateTime.local())}
        >
          {month.toFormat("LLLL yyyy")}
        </button>
        <Button
          variant="iconControl"
          size="icon-control-sm"
          onClick={() => setMonth((current) => current.plus({ months: 1 }))}
          aria-label="Next month"
        >
          <IconChevronRight className="size-4" />
        </Button>
      </div>

      {error ? (
        <InlineState
          title="Calendar data could not be loaded"
          description={
            error instanceof Error ? error.message : "Try refreshing."
          }
        />
      ) : isLoading && !data ? (
        <CalendarSkeleton />
      ) : visibleItems.length === 0 ? (
        <InlineState
          title={
            items.length
              ? "No items match these filters"
              : "Nothing planned in this month"
          }
          description={
            items.length
              ? "Clear a filter to bring more accounts and lifecycle states back into view."
              : "Upcoming automation slots will appear before their content is generated."
          }
        />
      ) : (
        <div
          className={cn(
            "grid gap-4",
            selectedItem && "xl:grid-cols-[1fr_340px]"
          )}
        >
          <MonthCalendar
            month={month}
            items={visibleItems}
            onSelect={setSelectedItem}
          />
          {selectedItem ? (
            <CalendarItemDetail
              key={selectedItem.id}
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
              onChanged={async () => {
                setSelectedItem(null)
                await mutate()
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function MonthCalendar({
  month,
  items,
  onSelect,
}: {
  month: DateTime
  items: CalendarItem[]
  onSelect: (item: CalendarItem) => void
}) {
  const monthStart = month.startOf("month")
  const gridStart = monthStart.startOf("week")
  const days = Array.from({ length: 42 }, (_, index) =>
    gridStart.plus({ days: index })
  )
  return (
    <section className="min-w-0 overflow-hidden rounded-[14px] border border-app-panel-border bg-app-surface">
      <div className="grid grid-cols-7 border-b border-[#e8e6de] bg-app-surface-subtle">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div
            key={day}
            className="px-3 py-2 text-[11px] font-semibold text-app-muted-text"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayItems = itemsForDay(items, day)
          return (
            <div
              key={day.toISODate()}
              className={cn(
                "min-h-[132px] min-w-0 border-r border-b border-[#eceae3] p-2",
                !day.hasSame(monthStart, "month") &&
                  "bg-app-surface-subtle text-app-text-faint"
              )}
            >
              <div
                className={cn(
                  "mb-2 grid size-6 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
                  day.hasSame(DateTime.local(), "day") &&
                    "bg-app-strong text-white"
                )}
              >
                {day.day}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 4).map((item) => (
                  <CalendarItemButton
                    key={item.id}
                    item={item}
                    onClick={() => onSelect(item)}
                  />
                ))}
                {dayItems.length > 4 ? (
                  <div className="px-1 text-[10px] font-semibold text-app-muted-text">
                    +{dayItems.length - 4} more
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CalendarItemButton({
  item,
  onClick,
}: {
  item: CalendarItem
  onClick: () => void
}) {
  const provider = primaryProvider(item)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "lc-focus-ring group w-full overflow-hidden rounded-[6px] border px-2 py-1.5 text-left transition duration-200 hover:-translate-y-px hover:shadow-sm active:translate-y-0",
        lifecycleClass(item.status),
        item.paused && "line-through opacity-45"
      )}
      title={`${statusLabel(item.status)} · ${item.timezone} · Your time ${DateTime.fromISO(item.datetime).toFormat("ccc, LLL d · h:mm a")}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {item.status === "generating" ? (
          <IconLoader2 className="size-3 shrink-0 animate-spin" />
        ) : (
          <PlatformMark provider={provider} />
        )}
        <span className="truncate text-[10px] font-bold tabular-nums">
          {automationDateTime(item).toFormat("h:mm a")}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10px] font-semibold">
        {item.automationName || item.title}
      </div>
    </button>
  )
}

function CalendarItemDetail({
  item,
  onClose,
  onChanged,
}: {
  item: CalendarItem
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState("")

  async function cancelPost() {
    if (!item.links.cancel) return
    setCancelling(true)
    setActionError("")
    try {
      await fetchJsonWithTimeout(item.links.cancel, { method: "DELETE" })
      await onChanged()
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The post could not be cancelled."
      )
    } finally {
      setCancelling(false)
    }
  }

  return (
    <aside className="h-fit rounded-[14px] border border-app-panel-border bg-app-surface p-5 shadow-[0_18px_50px_rgba(70,62,38,0.12)] xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-4">
        <StatusBadge status={item.status} />
        <button
          type="button"
          onClick={onClose}
          className="lc-focus-ring grid size-7 place-items-center rounded-[6px] text-app-muted-text transition hover:bg-app-surface-subtle hover:text-app-text"
          aria-label="Close details"
        >
          <IconX className="size-4" />
        </button>
      </div>
      <h2 className="mt-5 text-[20px] leading-6 font-semibold tracking-[-0.02em] text-app-text">
        {item.title}
      </h2>
      {item.automationName ? (
        <p className="mt-1 text-[12px] font-semibold text-app-text-faint">
          {item.automationName}
        </p>
      ) : null}
      {item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Generated and provider preview URLs are dynamic.
        <img
          src={item.previewUrl}
          alt="Content preview"
          className="mt-4 aspect-[4/3] w-full rounded-[9px] object-cover"
        />
      ) : null}
      <p className="mt-4 line-clamp-6 text-[13px] leading-5 font-medium text-app-text-soft">
        {item.excerpt || "No caption is available yet."}
      </p>

      <dl className="mt-5 grid grid-cols-[92px_1fr] gap-y-3 border-y border-[#eceae3] py-4 text-[12px]">
        <DetailRow
          label="Scheduled"
          value={formatTimestamp(item.datetime, item.timezone)}
        />
        <DetailRow label="Timezone" value={item.timezone} />
        <DetailRow label="Source" value={humanize(item.sourceType)} />
        {Object.entries(item.timestamps).flatMap(([label, value]) =>
          value && value !== item.datetime
            ? [
                <DetailRow
                  key={label}
                  label={timestampLabel(label)}
                  value={formatTimestamp(value, item.timezone)}
                />,
              ]
            : []
        )}
      </dl>

      <div className="mt-4 space-y-2">
        <div className="text-[10px] font-bold tracking-[0.05em] text-app-text-faint uppercase">
          Targets
        </div>
        {item.targets.length ? (
          item.targets.map((target, index) => (
            <div
              key={`${target.integrationId || target.provider}:${index}`}
              className="flex items-center justify-between gap-3 rounded-[8px] bg-[#f7f6f1] px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <PlatformMark provider={target.provider} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-app-text">
                    {target.integrationName || providerLabel(target.provider)}
                  </div>
                  <div className="text-[10px] font-medium text-app-text-faint">
                    {providerLabel(target.provider)}
                  </div>
                </div>
              </div>
              <StatusBadge status={target.status} />
            </div>
          ))
        ) : (
          <p className="rounded-[8px] bg-[#f7f6f1] px-3 py-2 text-[11px] font-medium text-app-text-faint">
            No publishing target is connected.
          </p>
        )}
      </div>

      {item.error ? (
        <div className="mt-4 rounded-[8px] bg-[#fff0ed] p-3 text-[12px] leading-5 font-semibold text-[#9b342a]">
          {item.error}
        </div>
      ) : null}
      {actionError ? (
        <p className="mt-3 text-[11px] font-semibold text-[#9b342a]">
          {actionError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {item.links.content || item.links.automation ? (
          <Button variant="action" size="compact" asChild>
            <a href={item.links.content || item.links.automation}>
              View content
            </a>
          </Button>
        ) : null}
        {item.links.live ? (
          <Button variant="softControl" size="compact" asChild>
            <a href={item.links.live} target="_blank" rel="noreferrer">
              Live post <IconExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
        {item.status === "scheduled" && item.links.cancel ? (
          <Button
            variant="softControl"
            size="compact"
            disabled={cancelling}
            onClick={() => void cancelPost()}
          >
            {cancelling ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : null}
            Cancel
          </Button>
        ) : null}
      </div>
    </aside>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-app-text-faint">{label}</dt>
      <dd className="font-semibold text-app-text">{value}</dd>
    </>
  )
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Array<readonly [string, string]>
  selected: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <details className="group relative">
      <summary className="lc-focus-ring flex h-9 cursor-pointer list-none items-center gap-2 rounded-[7px] border border-[#d8d6cc] bg-app-surface px-3 text-[12px] font-semibold text-[#4e4d48] transition hover:border-[#bdbab0] [&::-webkit-details-marker]:hidden">
        {selected.length
          ? `${label} · ${selected.length}`
          : `All ${label.toLowerCase()}`}
        <IconChevronDown className="size-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="absolute top-11 left-0 z-20 min-w-[230px] rounded-[10px] border border-[#dedcd3] bg-app-surface p-2 shadow-[0_16px_40px_rgba(60,55,40,0.16)]">
        <button
          type="button"
          className="lc-focus-ring mb-1 w-full rounded-[6px] px-2 py-1.5 text-left text-[11px] font-semibold text-app-muted-text hover:bg-app-surface-subtle"
          onClick={() => onChange([])}
        >
          Select all
        </button>
        <div className="max-h-64 overflow-y-auto">
          {options.map(([value, optionLabel]) => {
            const checked = selected.includes(value)
            return (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-2 text-[12px] font-semibold text-[#3f3e3a] hover:bg-[#f7f6f1]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((item) => item !== value)
                        : [...selected, value]
                    )
                  }
                  className="size-3.5 accent-[#242421]"
                />
                <span className="truncate">{optionLabel}</span>
              </label>
            )
          })}
        </div>
      </div>
    </details>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "amber" | "red" | "neutral"
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-4 py-3",
        tone === "amber"
          ? "bg-[#fff2d8]"
          : tone === "red"
            ? "bg-[#fde9e5]"
            : "bg-[#eeede7]"
      )}
    >
      <div className="text-[11px] font-semibold tracking-[0.06em] text-app-muted-text uppercase">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold text-app-text tabular-nums">
        {value}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: CalendarLifecycleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-1 text-[9px] font-bold tracking-[0.035em] uppercase",
        lifecycleBadgeClass(status)
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "generating" && "animate-pulse",
          lifecycleDotClass(status)
        )}
      />
      {statusLabel(status)}
    </span>
  )
}

function PlatformMark({ provider }: { provider: string }) {
  const className = "size-3 shrink-0"
  switch (provider.toLowerCase()) {
    case "tiktok":
    case "tiktok-creative":
    case "tiktok-seller":
      return <IconBrandTiktok className={className} />
    case "instagram":
      return <IconBrandInstagram className={className} />
    case "facebook":
      return <IconBrandFacebookFilled className={className} />
    case "youtube":
      return <IconBrandYoutubeFilled className={className} />
    case "x":
    case "twitter":
      return <IconBrandX className={className} />
    case "threads":
      return <IconBrandThreads className={className} />
    case "linkedin":
      return <IconBrandLinkedin className={className} />
    case "pinterest":
      return <IconBrandPinterest className={className} />
    case "bluesky":
      return <IconBrandBluesky className={className} />
    case "telegram":
      return <IconBrandTelegram className={className} />
    case "google":
    case "google-business-profile":
      return <IconBrandGoogleFilled className={className} />
    default:
      return (
        <span className="size-2 shrink-0 rounded-full bg-current opacity-60" />
      )
  }
}

function CalendarSkeleton() {
  return (
    <div className="rounded-[14px] border border-app-panel-border bg-app-surface p-5">
      <SkeletonBlock className="h-8 w-full rounded" />
      <div className="mt-4 grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }, (_, index) => (
          <SkeletonBlock key={index} className="h-24 rounded" />
        ))}
      </div>
    </div>
  )
}

function InlineState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d8d6cc] bg-app-surface-subtle px-6 py-12 text-center">
      <div className="text-[15px] font-semibold text-app-text">{title}</div>
      <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-5 font-medium text-app-muted-text">
        {description}
      </p>
    </div>
  )
}

function monthRange(month: DateTime) {
  return {
    from: month.startOf("month").startOf("week"),
    to: month.endOf("month").endOf("week"),
  }
}

function itemsForDay(items: CalendarItem[], day: DateTime) {
  return items.filter(
    (item) => automationDateTime(item).toISODate() === day.toISODate()
  )
}

function automationDateTime(item: CalendarItem) {
  return DateTime.fromISO(item.datetime, { zone: item.timezone })
}

function accountOptions(
  items: CalendarItem[]
): Array<readonly [string, string]> {
  return [
    ...new Map(
      items.flatMap((item) =>
        item.targets.flatMap((target) =>
          target.integrationId
            ? [
                [
                  target.integrationId,
                  target.integrationName || target.integrationId,
                ] as const,
              ]
            : []
        )
      )
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
}

function matchesFilters(item: CalendarItem, filters: CalendarFilters) {
  return (
    (!filters.accounts.length ||
      item.targets.some(
        (target) =>
          target.integrationId &&
          filters.accounts.includes(target.integrationId)
      )) &&
    (!filters.statuses.length || filters.statuses.includes(item.status)) &&
    (filters.platform === "all" ||
      item.targets.some((target) => target.provider === filters.platform)) &&
    (filters.automation === "all" ||
      item.automationId === filters.automation) &&
    (filters.sourceType === "all" || item.sourceType === filters.sourceType)
  )
}

function normalizeStoredFilters(value: unknown): CalendarFilters {
  if (!value || typeof value !== "object") return defaultFilters
  const record = value as Record<string, unknown>
  return {
    accounts: stringArray(record.accounts),
    statuses: stringArray(record.statuses).filter(
      (status): status is CalendarLifecycleStatus =>
        lifecycleOptions.some((option) => option.value === status)
    ),
    platform: typeof record.platform === "string" ? record.platform : "all",
    automation:
      typeof record.automation === "string" ? record.automation : "all",
    sourceType:
      typeof record.sourceType === "string" ? record.sourceType : "all",
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function hasFilters(filters: CalendarFilters) {
  return Boolean(
    filters.accounts.length ||
    filters.statuses.length ||
    filters.platform !== "all" ||
    filters.automation !== "all" ||
    filters.sourceType !== "all"
  )
}

function primaryProvider(item: CalendarItem) {
  return item.targets[0]?.provider || "unassigned"
}

function lifecycleClass(status: CalendarLifecycleStatus) {
  if (status === "planned")
    return "border-dashed border-[#aaa89d] bg-[#f7f6f1]/70 text-[#5f5e58]"
  if (status === "generating")
    return "border-[#b8aee3] bg-[#f1edff] text-[#544c78] shadow-[0_0_0_2px_rgba(135,117,210,0.08)]"
  if (status === "needs_action")
    return "border-[#e2b75e] bg-[#fff2d8] text-[#785511]"
  if (isFailed(status)) return "border-[#dd8a7f] bg-[#fde9e5] text-[#8e342c]"
  if (status === "published")
    return "border-[#75aa87] bg-[#dceee1] text-[#356746]"
  if (status === "scheduled")
    return "border-[#819acb] bg-[#dde5f5] text-[#405a8f]"
  return "border-[#c9c7be] bg-[#eeede8] text-app-text-soft"
}

function lifecycleBadgeClass(status: CalendarLifecycleStatus) {
  if (isFailed(status)) return "bg-[#fde9e5] text-[#8e342c]"
  if (status === "needs_action") return "bg-[#fff2d8] text-[#785511]"
  if (status === "published") return "bg-[#e5f4e9] text-[#356746]"
  if (status === "scheduled") return "bg-[#e9eef9] text-[#405a8f]"
  if (status === "generating") return "bg-[#f1edff] text-[#544c78]"
  return "bg-app-surface-subtle text-app-text-soft"
}

function lifecycleDotClass(status: CalendarLifecycleStatus) {
  if (isFailed(status)) return "bg-[#c94f42]"
  if (status === "needs_action") return "bg-[#c7861c]"
  if (status === "published") return "bg-[#3d8c5b]"
  if (status === "scheduled") return "bg-[#5977b5]"
  if (status === "generating") return "bg-[#7867bd]"
  return "bg-[#8a8982]"
}

function isFailed(status: CalendarLifecycleStatus) {
  return status === "failed" || status === "generation_failed"
}

function statusLabel(status: CalendarLifecycleStatus) {
  return humanize(status)
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase())
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    x: "X",
    twitter: "X",
    tiktok: "TikTok",
    "tiktok-creative": "TikTok Creative",
    "tiktok-seller": "TikTok Seller",
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    pinterest: "Pinterest",
    threads: "Threads",
    telegram: "Telegram",
    bluesky: "Bluesky",
    google: "Google Business Profile",
    "google-business-profile": "Google Business Profile",
  }
  return labels[provider.toLowerCase()] || humanize(provider)
}

function formatTimestamp(value: string, timezone: string) {
  return DateTime.fromISO(value, { zone: timezone }).toFormat(
    "ccc, LLL d · h:mm a"
  )
}

function timestampLabel(value: string) {
  const labels: Record<string, string> = {
    createdAt: "Created",
    updatedAt: "Updated",
    scheduledAt: "Scheduled",
    publishedAt: "Published",
  }
  return labels[value] || humanize(value)
}
