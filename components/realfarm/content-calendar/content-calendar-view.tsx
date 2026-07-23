"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { DateTime } from "luxon"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import timeGridPlugin from "@fullcalendar/timegrid"
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core"
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
  IconActivity,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconDatabase,
  IconExternalLink,
  IconFilter,
  IconLoader2,
  IconRefresh,
  IconSparkles,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import { DropdownMenu, Select } from "radix-ui"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import type {
  CalendarItem,
  CalendarLifecycleStatus,
} from "@/lib/calendar-items"
import {
  calendarTimingEntries,
  reconcileCalendarFilterValue,
  reconcileCalendarFilterValues,
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

type CalendarFilterOption = {
  value: string
  label: string
  provider?: string
  status?: CalendarLifecycleStatus
}

const filterStorageKey = "lumenclip:calendar-filters:v1"
const defaultFilters: CalendarFilters = {
  accounts: [],
  statuses: [],
  platform: "all",
  automation: "all",
  sourceType: "all",
}
const lifecycleOptions: CalendarFilterOption[] = [
  { value: "planned", label: "Planned", status: "planned" },
  { value: "generating", label: "Generating", status: "generating" },
  {
    value: "generation_failed",
    label: "Generation failed",
    status: "generation_failed",
  },
  { value: "needs_action", label: "Needs action", status: "needs_action" },
  { value: "draft", label: "Draft", status: "draft" },
  { value: "failed", label: "Failed", status: "failed" },
  { value: "scheduled", label: "Scheduled", status: "scheduled" },
  { value: "published", label: "Published", status: "published" },
]

export function ContentCalendarView({
  onGoAutomations,
}: {
  onGoAutomations: () => void
}) {
  const [visibleRange, setVisibleRange] = useState(() => {
    const range = monthRange(DateTime.local())
    return {
      from: range.from.toUTC().toISO() ?? "",
      to: range.to.toUTC().toISO() ?? "",
    }
  })
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
  const [calendarActionError, setCalendarActionError] = useState("")
  const [filters, setFilters] = useState<CalendarFilters>(defaultFilters)
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  const requestKey = `/api/calendar?from=${encodeURIComponent(visibleRange.from)}&to=${encodeURIComponent(visibleRange.to)}`
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CalendarPayload>(requestKey, clientSWRFetcher, {
      keepPreviousData: true,
    })

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(filterStorageKey)
      // Browser-only persisted state cannot be read during the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const platforms = useMemo<CalendarFilterOption[]>(
    () =>
      [
        ...new Set(
          items.flatMap((item) => item.targets.map((target) => target.provider))
        ),
      ]
        .map((provider) => provider.trim())
        .filter(Boolean)
        .sort()
        .map((provider) => ({
          value: provider,
          label: providerLabel(provider),
          provider,
        })),
    [items]
  )
  const automations = useMemo(() => automationOptions(items), [items])
  const sourceTypes = useMemo(() => sourceTypeOptions(items), [items])
  const activeFilters = useMemo(
    () =>
      reconcileAvailableFilters(filters, {
        accounts,
        automations,
        platforms,
        sourceTypes,
      }),
    [accounts, automations, filters, platforms, sourceTypes]
  )
  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilters(item, activeFilters)),
    [activeFilters, items]
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
  const events = useMemo<EventInput[]>(
    () =>
      visibleItems.map((item) => ({
        id: item.id,
        title: item.automationName || item.title,
        start: item.datetime,
        editable: Boolean(item.links.reschedule),
        startEditable: Boolean(item.links.reschedule),
        durationEditable: false,
        classNames: [
          `lumenclip-calendar-event--${item.status.replaceAll("_", "-")}`,
          ...(item.paused ? ["lumenclip-calendar-event--paused"] : []),
        ],
        extendedProps: { item },
      })),
    [visibleItems]
  )

  function handleDatesSet(info: DatesSetArg) {
    const next = {
      from: info.start.toISOString(),
      to: info.end.toISOString(),
    }
    setVisibleRange((current) =>
      current.from === next.from && current.to === next.to ? current : next
    )
  }

  function handleEventClick(info: EventClickArg) {
    setSelectedItem(info.event.extendedProps.item as CalendarItem)
  }

  async function rescheduleCalendarItem(info: EventDropArg) {
    const item = info.event.extendedProps.item as CalendarItem
    const scheduledAt = info.event.start
    if (!item.links.reschedule || !scheduledAt || scheduledAt <= new Date()) {
      info.revert()
      setCalendarActionError("Choose a future time for the scheduled post.")
      return
    }

    setCalendarActionError("")
    try {
      await fetchJsonWithTimeout(item.links.reschedule, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }),
      })
      setSelectedItem(null)
      await mutate()
    } catch (error) {
      info.revert()
      setCalendarActionError(
        error instanceof Error
          ? error.message
          : "The post could not be rescheduled."
      )
    }
  }

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
            disabled={isValidating}
          >
            <IconRefresh
              className={cn("size-4", isValidating && "animate-spin")}
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
            allLabel="All accounts"
            emptyLabel="No accounts in range"
            icon={<IconUsers className="size-4" />}
            options={accounts}
            selected={activeFilters.accounts}
            renderOptionIcon={(option) => (
              <PlatformMark provider={option.provider || "unassigned"} />
            )}
            onChange={(accounts) =>
              setFilters((current) => ({ ...current, accounts }))
            }
          />
          <CalendarSelectFilter
            label="Platform"
            allLabel="All platforms"
            emptyLabel="No platforms in range"
            icon={<IconWorld className="size-4" />}
            options={platforms}
            value={activeFilters.platform}
            renderOptionIcon={(option) => (
              <PlatformMark provider={option.provider || option.value} />
            )}
            onChange={(platform) =>
              setFilters((current) => ({
                ...current,
                platform,
              }))
            }
          />
          <MultiSelectFilter
            label="Lifecycle"
            allLabel="All lifecycle states"
            emptyLabel="No lifecycle states"
            icon={<IconActivity className="size-4" />}
            options={lifecycleOptions}
            selected={activeFilters.statuses}
            renderOptionIcon={(option) => (
              <span
                className={cn(
                  "size-2 rounded-full",
                  lifecycleDotClass(
                    option.status || (option.value as CalendarLifecycleStatus)
                  )
                )}
              />
            )}
            onChange={(statuses) =>
              setFilters((current) => ({
                ...current,
                statuses: statuses as CalendarLifecycleStatus[],
              }))
            }
          />
          <CalendarSelectFilter
            label="Automation"
            allLabel="All automations"
            emptyLabel="No automations in range"
            icon={<IconSparkles className="size-4" />}
            options={automations}
            value={activeFilters.automation}
            renderOptionIcon={() => <IconSparkles className="size-3.5" />}
            onChange={(automation) =>
              setFilters((current) => ({
                ...current,
                automation,
              }))
            }
          />
          <CalendarSelectFilter
            label="Source"
            allLabel="All sources"
            emptyLabel="No sources in range"
            icon={<IconDatabase className="size-4" />}
            options={sourceTypes}
            value={activeFilters.sourceType}
            renderOptionIcon={() => <IconDatabase className="size-3.5" />}
            onChange={(sourceType) =>
              setFilters((current) => ({
                ...current,
                sourceType,
              }))
            }
          />
          {hasFilters(activeFilters) ? (
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

      {error && !data ? (
        <InlineState
          title="Calendar data could not be loaded"
          description={
            error instanceof Error ? error.message : "Try refreshing."
          }
        />
      ) : isLoading && !data ? (
        <CalendarSkeleton />
      ) : (
        <>
          {error && data ? (
            <div className="mb-3 rounded-[9px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-900">
              Showing the last loaded calendar data. Refresh failed.
            </div>
          ) : null}
          {calendarActionError ? (
            <div className="mb-3 rounded-[9px] bg-[#fff0ed] px-4 py-3 text-[12px] font-semibold text-[#9b342a]">
              {calendarActionError}
            </div>
          ) : null}
          <section className="lumenclip-calendar min-w-0 overflow-hidden rounded-[14px] border border-app-panel-border bg-app-surface p-3 sm:p-4">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              firstDay={1}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek",
              }}
              buttonText={{ month: "Month", week: "Week", today: "Today" }}
              events={events}
              editable
              eventStartEditable
              eventDurationEditable={false}
              eventAllow={(_dropInfo, draggedEvent) =>
                Boolean(draggedEvent?.extendedProps.item?.links?.reschedule)
              }
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventDrop={(info) => void rescheduleCalendarItem(info)}
              eventContent={renderCalendarEvent}
              dayMaxEvents={4}
              nowIndicator
              height="auto"
            />
            {!visibleItems.length ? (
              <p className="pointer-events-none mt-3 text-center text-[12px] font-medium text-app-muted-text">
                {items.length
                  ? "No items match the active filters."
                  : "Nothing is planned in this range yet."}
              </p>
            ) : null}
          </section>
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
        </>
      )}
    </div>
  )
}

function renderCalendarEvent(info: EventContentArg) {
  const item = info.event.extendedProps.item as CalendarItem
  const provider = primaryProvider(item)
  return (
    <div
      className="min-w-0 overflow-hidden px-1.5 py-1"
      title={calendarEventHoverText(item)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {item.status === "generating" ? (
          <IconLoader2 className="size-3 shrink-0 animate-spin" />
        ) : (
          <PlatformMark provider={provider} />
        )}
        <span className="truncate text-[10px] font-bold tabular-nums">
          {info.timeText}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10px] font-semibold">
        {item.automationName || item.title}
      </div>
    </div>
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
  const [cancelOpen, setCancelOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
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
      throw error
    } finally {
      setCancelling(false)
    }
  }

  async function retryGeneration() {
    if (!item.links.retry) return
    setRetrying(true)
    setActionError("")
    try {
      await fetchJsonWithTimeout(item.links.retry, { method: "POST" })
      await onChanged()
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The generation could not be retried."
      )
    } finally {
      setRetrying(false)
    }
  }

  return (
    <>
      <AppModal className="z-[70] bg-[#24251f]/45" onClose={onClose}>
        <AppModalPanel
          accessibleTitle={item.title}
          className="max-h-[calc(100vh-2rem)] max-w-[560px] overflow-y-auto p-0"
        >
          <article className="p-5 sm:p-6">
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
                          {target.integrationName ||
                            providerLabel(target.provider)}
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
              {item.status === "generation_failed" && item.links.retry ? (
                <Button
                  variant="action"
                  size="compact"
                  disabled={retrying}
                  onClick={() => void retryGeneration()}
                >
                  {retrying ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconRefresh className="size-3.5" />
                  )}
                  {retrying ? "Retrying" : "Retry generation"}
                </Button>
              ) : null}
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
                  onClick={() => setCancelOpen(true)}
                >
                  {cancelling ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : null}
                  Cancel
                </Button>
              ) : null}
            </div>
          </article>
        </AppModalPanel>
      </AppModal>
      {cancelOpen ? (
        <ConfirmDialog
          title="Cancel this scheduled post?"
          description="This removes the scheduled post from the publishing queue. You can schedule it again later."
          confirmLabel="Cancel post"
          pendingLabel="Cancelling…"
          onCancel={() => setCancelOpen(false)}
          onConfirm={cancelPost}
        />
      ) : null}
    </>
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
  allLabel,
  emptyLabel,
  icon,
  options,
  selected,
  renderOptionIcon,
  onChange,
}: {
  label: string
  allLabel: string
  emptyLabel: string
  icon: ReactNode
  options: CalendarFilterOption[]
  selected: string[]
  renderOptionIcon?: (option: CalendarFilterOption) => ReactNode
  onChange: (values: string[]) => void
}) {
  const selectedOptions = options.filter((option) =>
    selected.includes(option.value)
  )
  const displayValue = !options.length
    ? emptyLabel
    : selectedOptions.length === 0
      ? allLabel
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} ${label.toLowerCase()}`

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={!options.length}>
        <button
          type="button"
          className={calendarFilterTriggerClass}
          aria-label={`${label}: ${displayValue}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-app-muted-text">{icon}</span>
            <span className="truncate">{displayValue}</span>
          </span>
          <IconChevronDown className="size-3.5 shrink-0 text-app-text-faint" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="start"
          className="app-popover z-[120] min-w-[240px] p-1"
        >
          <DropdownMenu.CheckboxItem
            checked={selectedOptions.length === 0}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onChange([])}
            className={calendarFilterMenuItemClass}
          >
            <span className="grid size-4 shrink-0 place-items-center text-app-muted-text">
              {icon}
            </span>
            <span className="truncate">{allLabel}</span>
            <DropdownMenu.ItemIndicator className="absolute right-2">
              <IconCheck className="size-3.5" />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className="my-1 h-px bg-app-panel-border" />
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const checked = selected.includes(option.value)
              return (
                <DropdownMenu.CheckboxItem
                  key={option.value}
                  checked={checked}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() =>
                    onChange(
                      checked
                        ? selected.filter((item) => item !== option.value)
                        : [...selected, option.value]
                    )
                  }
                  className={calendarFilterMenuItemClass}
                >
                  <span className="grid size-4 shrink-0 place-items-center text-app-muted-text">
                    {renderOptionIcon?.(option)}
                  </span>
                  <span className="truncate">{option.label}</span>
                  <DropdownMenu.ItemIndicator className="absolute right-2">
                    <IconCheck className="size-3.5" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.CheckboxItem>
              )
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function CalendarSelectFilter({
  label,
  allLabel,
  emptyLabel,
  icon,
  options,
  value,
  renderOptionIcon,
  onChange,
}: {
  label: string
  allLabel: string
  emptyLabel: string
  icon: ReactNode
  options: CalendarFilterOption[]
  value: string
  renderOptionIcon?: (option: CalendarFilterOption) => ReactNode
  onChange: (value: string) => void
}) {
  const selectedOption = options.find((option) => option.value === value)
  const displayValue = !options.length
    ? emptyLabel
    : value === "all"
      ? allLabel
      : selectedOption?.label || allLabel

  return (
    <Select.Root
      value={value}
      disabled={!options.length}
      onValueChange={onChange}
    >
      <Select.Trigger
        className={calendarFilterTriggerClass}
        aria-label={`${label}: ${displayValue}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-app-muted-text">{icon}</span>
          <span className="truncate">{displayValue}</span>
        </span>
        <Select.Icon asChild>
          <IconChevronDown className="size-3.5 shrink-0 text-app-text-faint" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          align="start"
          className="app-popover z-[120] min-w-[240px] p-1"
        >
          <Select.Viewport className="max-h-72">
            <Select.Item value="all" className={calendarFilterMenuItemClass}>
              <span className="grid size-4 shrink-0 place-items-center text-app-muted-text">
                {icon}
              </span>
              <Select.ItemText>{allLabel}</Select.ItemText>
              <Select.ItemIndicator className="absolute right-2">
                <IconCheck className="size-3.5" />
              </Select.ItemIndicator>
            </Select.Item>
            <Select.Separator className="my-1 h-px bg-app-panel-border" />
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className={calendarFilterMenuItemClass}
              >
                <span className="grid size-4 shrink-0 place-items-center text-app-muted-text">
                  {renderOptionIcon?.(option)}
                </span>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2">
                  <IconCheck className="size-3.5" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

const calendarFilterTriggerClass =
  "lc-focus-ring flex h-9 min-w-[168px] max-w-[230px] items-center justify-between gap-3 rounded-[7px] border border-app-panel-border-strong bg-app-control-bg px-3 text-left text-[12px] font-semibold text-app-text-soft shadow-app-control transition hover:border-app-text-faint hover:bg-app-control-hover disabled:cursor-not-allowed disabled:bg-app-surface-subtle disabled:text-app-text-faint disabled:opacity-80"

const calendarFilterMenuItemClass =
  "relative flex h-9 cursor-default select-none items-center gap-2 rounded-[6px] px-3 pr-8 text-[12px] font-semibold text-app-text outline-none data-[highlighted]:bg-app-control-hover data-[disabled]:opacity-50"

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

function accountOptions(items: CalendarItem[]): CalendarFilterOption[] {
  return [
    ...new Map(
      items.flatMap((item) =>
        item.targets.flatMap((target) =>
          target.integrationId
            ? [
                [
                  target.integrationId,
                  {
                    value: target.integrationId,
                    label:
                      target.integrationName?.trim() ||
                      `${providerLabel(target.provider)} account (${target.integrationId.slice(-6)})`,
                    provider: target.provider,
                  },
                ] as const,
              ]
            : []
        )
      )
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

function automationOptions(items: CalendarItem[]): CalendarFilterOption[] {
  return [
    ...new Map(
      items.flatMap((item) =>
        item.automationId
          ? [
              [
                item.automationId,
                {
                  value: item.automationId,
                  label:
                    item.automationName?.trim() ||
                    `Automation ${item.automationId.slice(0, 8)}`,
                },
              ] as const,
            ]
          : []
      )
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

function sourceTypeOptions(items: CalendarItem[]): CalendarFilterOption[] {
  return [
    ...new Map(
      items.flatMap((item) => {
        const sourceType = item.sourceType.trim()
        return sourceType
          ? [
              [
                sourceType,
                { value: sourceType, label: humanize(sourceType) },
              ] as const,
            ]
          : []
      })
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

function reconcileAvailableFilters(
  filters: CalendarFilters,
  options: {
    accounts: CalendarFilterOption[]
    automations: CalendarFilterOption[]
    platforms: CalendarFilterOption[]
    sourceTypes: CalendarFilterOption[]
  }
): CalendarFilters {
  return {
    ...filters,
    accounts: reconcileCalendarFilterValues(
      filters.accounts,
      options.accounts.map((option) => option.value)
    ),
    platform: reconcileCalendarFilterValue(
      filters.platform,
      options.platforms.map((option) => option.value)
    ),
    automation: reconcileCalendarFilterValue(
      filters.automation,
      options.automations.map((option) => option.value)
    ),
    sourceType: reconcileCalendarFilterValue(
      filters.sourceType,
      options.sourceTypes.map((option) => option.value)
    ),
  }
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
      item.targets.some(
        (target) => target.provider.trim() === filters.platform
      )) &&
    (filters.automation === "all" ||
      item.automationId === filters.automation) &&
    (filters.sourceType === "all" ||
      item.sourceType.trim() === filters.sourceType)
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

function calendarEventHoverText(item: CalendarItem) {
  return calendarTimingEntries(item)
    .map(
      ({ label, at }) =>
        `${label}: ${at ? `${formatTimestamp(at, item.timezone)} (${item.timezone})` : "Unavailable"}`
    )
    .join("\n")
}

function timestampLabel(value: string) {
  const labels: Record<string, string> = {
    createdAt: "Created",
    updatedAt: "Updated",
    scheduledAt: "Scheduled",
    publishedAt: "Published",
    generatedAt: "Generated",
    expectedGenerationAt: "Expected generation",
    expectedPublishedAt: "Expected publication",
  }
  return labels[value] || humanize(value)
}
