import {
  reconcileCalendarFilterValue,
  reconcileCalendarFilterValues,
  type CalendarItem,
  type CalendarLifecycleStatus,
} from "@/features/calendar/domain/calendar"

export type CalendarViewFilters = {
  accounts: string[]
  statuses: CalendarLifecycleStatus[]
  platform: string
  automation: string
  sourceType: string
}

export type CalendarFilterOption = {
  value: string
  label: string
  provider?: string
  status?: CalendarLifecycleStatus
}

export const defaultCalendarViewFilters: CalendarViewFilters = {
  accounts: [],
  statuses: [],
  platform: "all",
  automation: "all",
  sourceType: "all",
}

export const calendarLifecycleOptions: CalendarFilterOption[] = [
  { value: "planned", label: "Planned", status: "planned" },
  { value: "needs_action", label: "Needs action", status: "needs_action" },
  { value: "draft", label: "Draft", status: "draft" },
  { value: "failed", label: "Failed", status: "failed" },
  { value: "scheduled", label: "Scheduled", status: "scheduled" },
  { value: "published", label: "Published", status: "published" },
]

export function calendarAccountOptions(
  items: CalendarItem[]
): CalendarFilterOption[] {
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
                      `${calendarProviderLabel(target.provider)} account (${target.integrationId.slice(-6)})`,
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

export function calendarPlatformOptions(
  items: CalendarItem[]
): CalendarFilterOption[] {
  return [
    ...new Set(
      items.flatMap((item) => item.targets.map((target) => target.provider))
    ),
  ]
    .map((provider) => provider.trim())
    .filter(Boolean)
    .sort()
    .map((provider) => ({
      value: provider,
      label: calendarProviderLabel(provider),
      provider,
    }))
}

export function calendarAutomationOptions(
  items: CalendarItem[]
): CalendarFilterOption[] {
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
                    `Template ${item.automationId.slice(0, 8)}`,
                },
              ] as const,
            ]
          : []
      )
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

export function calendarSourceTypeOptions(
  items: CalendarItem[]
): CalendarFilterOption[] {
  return [
    ...new Map(
      items.flatMap((item) => {
        const sourceType = item.sourceType.trim()
        return sourceType
          ? [
              [
                sourceType,
                { value: sourceType, label: calendarHumanize(sourceType) },
              ] as const,
            ]
          : []
      })
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

export function reconcileCalendarViewFilters(
  filters: CalendarViewFilters,
  options: {
    accounts: CalendarFilterOption[]
    automations: CalendarFilterOption[]
    platforms: CalendarFilterOption[]
    sourceTypes: CalendarFilterOption[]
  }
): CalendarViewFilters {
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

export function calendarItemMatchesViewFilters(
  item: CalendarItem,
  filters: CalendarViewFilters
) {
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

export function normalizeStoredCalendarFilters(
  value: unknown
): CalendarViewFilters {
  if (!value || typeof value !== "object") return defaultCalendarViewFilters
  const record = value as Record<string, unknown>
  return {
    accounts: stringArray(record.accounts),
    statuses: stringArray(record.statuses).filter(
      (status): status is CalendarLifecycleStatus =>
        calendarLifecycleOptions.some((option) => option.value === status)
    ),
    platform: typeof record.platform === "string" ? record.platform : "all",
    automation:
      typeof record.automation === "string" ? record.automation : "all",
    sourceType:
      typeof record.sourceType === "string" ? record.sourceType : "all",
  }
}

export function hasCalendarViewFilters(filters: CalendarViewFilters) {
  return Boolean(
    filters.accounts.length ||
    filters.statuses.length ||
    filters.platform !== "all" ||
    filters.automation !== "all" ||
    filters.sourceType !== "all"
  )
}

export function countCalendarViewFilters(filters: CalendarViewFilters) {
  return (
    filters.accounts.length +
    filters.statuses.length +
    Number(filters.platform !== "all") +
    Number(filters.automation !== "all") +
    Number(filters.sourceType !== "all")
  )
}

export function primaryCalendarProvider(item: CalendarItem) {
  return item.targets[0]?.provider || "unassigned"
}

export function calendarHumanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase())
}

export function calendarProviderLabel(provider: string) {
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
  return labels[provider.toLowerCase()] || calendarHumanize(provider)
}

export function isFailedCalendarStatus(status: CalendarLifecycleStatus) {
  return status === "failed"
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}
