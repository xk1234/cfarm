import type { JobStatus } from "@/lib/queue"
import type { PostFastPostStatus } from "@/lib/postfast-posts"

export type CalendarLifecycleStatus =
  | "planned"
  | "generating"
  | "generation_failed"
  | "needs_action"
  | "draft"
  | "failed"
  | "scheduled"
  | "published"

export type CalendarItemSource =
  "projection" | "job" | "local_post" | "postfast"

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
  /** Exact automation slot ISO used in the queue dedupe key. */
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
    retry?: string
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

export type CalendarFilters = {
  accounts?: Set<string>
  platforms?: Set<string>
  statuses?: Set<string>
  automations?: Set<string>
  sourceTypes?: Set<string>
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

export function calendarLifecycleForJob(
  status: JobStatus | "leased"
): CalendarLifecycleStatus | null {
  if (status === "queued" || status === "processing" || status === "leased") {
    return "generating"
  }
  if (status === "failed" || status === "dead") return "generation_failed"
  return null
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
  status: PostFastPostStatus
): CalendarLifecycleStatus | null {
  if (status === "awaiting_manual_post" || status === "ready_for_review") {
    return "needs_action"
  }
  if (status === "draft") return "draft"
  if (status === "failed") return "failed"
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
  filters: CalendarFilters
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

function matches(filter: Set<string> | undefined, values: string[]) {
  return !filter?.size || values.some((value) => filter.has(value))
}
