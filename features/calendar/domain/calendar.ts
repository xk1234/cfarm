export type CalendarLifecycleStatus =
  "planned" | "needs_action" | "draft" | "failed" | "scheduled" | "published"

export type CalendarItemSource = "projection" | "local_post" | "postfast"

export type CalendarTarget = {
  integrationId?: string
  integrationName?: string
  provider: string
  status: CalendarLifecycleStatus
}

export type CalendarItem = {
  id: string
  status: CalendarLifecycleStatus
  datetime: string
  /** Exact automation slot ISO used to reconcile projections with real items. */
  slot?: string
  timezone: string
  automationId?: string
  automationName?: string
  targets: CalendarTarget[]
  source: CalendarItemSource
  sourceType: string
  sourceId: string
  title: string
  excerpt?: string
  previewUrl?: string
  paused?: boolean
  error?: string
  links: {
    content?: string
    automation?: string
    live?: string
    cancel?: string
    reschedule?: string
  }
  timestamps: {
    createdAt?: string
    updatedAt?: string
    scheduledAt?: string
    publishedAt?: string
    generatedAt?: string
    expectedGenerationAt?: string
    expectedPublishedAt?: string
  }
}

export type CalendarTimingEntry = {
  label: string
  at?: string
}

export type CalendarQueryFilters = {
  accounts?: Set<string>
  platforms?: Set<string>
  statuses?: Set<string>
  automations?: Set<string>
  sourceTypes?: Set<string>
}

export type CalendarSummary = {
  needsAction: number
  failed: number
  planned: number
}

export type CalendarPayload = {
  items: CalendarItem[]
  summary: CalendarSummary
  range: { from: string; to: string }
}

export function automationSlotDedupeKey(automationId: string, slotISO: string) {
  return `auto:${automationId}:${slotISO}`
}

export function calendarItemSlotKey(item: CalendarItem) {
  return item.automationId && item.slot
    ? automationSlotDedupeKey(item.automationId, item.slot)
    : null
}

export function dedupeCalendarItems(items: CalendarItem[]) {
  const materializedKeys = new Set(
    items.flatMap((item) => {
      if (item.source === "projection") return []
      const key = calendarItemSlotKey(item)
      return key ? [key] : []
    })
  )
  const seen = new Set<string>()
  return items
    .filter((item) => {
      if (item.source !== "projection") return true
      const key = calendarItemSlotKey(item)
      return !key || !materializedKeys.has(key)
    })
    .filter((item) => {
      const key = `${item.source}:${item.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort(
      (first, second) =>
        Date.parse(first.datetime) - Date.parse(second.datetime)
    )
}

export function calendarTimingEntries(
  item: CalendarItem
): CalendarTimingEntry[] {
  const generatedAt = item.timestamps.generatedAt
  const publishedAt = item.timestamps.publishedAt
  return [
    generatedAt
      ? { label: "Generated on", at: generatedAt }
      : {
          label: "Expected to be generated on",
          at: item.timestamps.expectedGenerationAt,
        },
    publishedAt
      ? { label: "Published on", at: publishedAt }
      : {
          label: "Expected to be published on",
          at: item.timestamps.expectedPublishedAt,
        },
  ]
}

export function calendarLifecycleForLocalPost(
  status: string
): CalendarLifecycleStatus | null {
  if (status === "awaiting_manual_post" || status === "ready_for_review") {
    return "needs_action"
  }
  if (status === "draft") return "draft"
  if (status === "failed") return "failed"
  if (status === "published") return "published"
  return null
}

export function calendarLifecycleForPostFast(
  status: string
): CalendarLifecycleStatus | null {
  const normalized = status.trim().toUpperCase()
  if (normalized === "PUBLISHED" || normalized === "POSTED") {
    return "published"
  }
  if (normalized === "SCHEDULED" || normalized === "QUEUE") {
    return "scheduled"
  }
  return null
}

export function calendarItemMatchesFilters(
  item: CalendarItem,
  filters: CalendarQueryFilters
) {
  return (
    matches(filters.statuses, [item.status]) &&
    matches(
      filters.automations,
      item.automationId ? [item.automationId] : []
    ) &&
    matches(filters.sourceTypes, [item.sourceType]) &&
    matches(
      filters.accounts,
      item.targets.flatMap((target) =>
        target.integrationId ? [target.integrationId] : []
      )
    ) &&
    matches(
      filters.platforms,
      item.targets.map((target) => target.provider.toLowerCase())
    )
  )
}

export function reconcileCalendarFilterValue(
  value: string,
  availableValues: Iterable<string>
) {
  if (value === "all") return value
  return new Set(availableValues).has(value) ? value : "all"
}

export function reconcileCalendarFilterValues(
  values: string[],
  availableValues: Iterable<string>
) {
  const available = new Set(availableValues)
  return values.filter((value) => available.has(value))
}

export function summarizeCalendarItems(items: CalendarItem[]): CalendarSummary {
  return {
    needsAction: items.filter((item) => item.status === "needs_action").length,
    failed: items.filter((item) => item.status === "failed").length,
    planned: items.filter((item) => item.status === "planned").length,
  }
}

function matches(filter: Set<string> | undefined, values: string[]) {
  return !filter?.size || values.some((value) => filter.has(value))
}
