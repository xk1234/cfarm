/**
 * Calendar items are projections of `posts` rows (scheduled, publishing,
 * published and failed SocialBu posts). Shared by the calendar API and the
 * calendar view, so this module stays client-safe (no server imports).
 */
import type { Post, PostStatus, RenderSummary } from "@/lib/data/types"

export type CalendarLifecycleStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  /** @deprecated Automation-era states; no longer produced. */
  | "planned"
  | "generating"
  | "generation_failed"
  | "needs_action"

export type CalendarItemSource = "post"

export type CalendarTarget = {
  /** SocialBu account id. */
  integrationId?: string
  integrationName?: string
  provider: string
  status: CalendarLifecycleStatus
}

export type CalendarItem = {
  id: string
  status: CalendarLifecycleStatus
  datetime: string
  timezone: string
  targets: CalendarTarget[]
  source: CalendarItemSource
  sourceType: string
  sourceId: string
  title: string
  excerpt?: string
  previewUrl?: string
  error?: string
  /** @deprecated Automation-era fields; never set. */
  slot?: string
  automationId?: string
  automationName?: string
  paused?: boolean
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

export type CalendarSummary = { needsAction: number; failed: number; planned: number }

export function calendarLifecycleForPost(status: PostStatus): CalendarLifecycleStatus | null {
  if (status === "canceled") return null
  return status
}

export type CalendarRenderContext = Pick<RenderSummary, "id" | "title" | "createdAt" | "completedAt"> & {
  previewUrl?: string
}

export function calendarItemFromPost(
  post: Post,
  options: {
    render?: CalendarRenderContext | null
    accountName?: string
    timezone?: string
  } = {}
): CalendarItem | null {
  const status = calendarLifecycleForPost(post.status)
  const datetime = post.publishedAt ?? post.publishAt
  if (!status || !datetime) return null
  const render = options.render ?? null
  const caption = post.caption.trim()
  const postUrl = `/api/publishing/posts/${encodeURIComponent(post.id)}`
  return {
    id: post.id,
    status,
    datetime,
    timezone: options.timezone ?? "UTC",
    targets: [
      {
        integrationId: post.accountId,
        integrationName: options.accountName,
        provider: post.provider,
        status,
      },
    ],
    source: "post",
    sourceType: "slideshow",
    sourceId: post.renderId,
    title: render?.title?.trim() || firstLine(caption) || "Slideshow",
    ...(caption ? { excerpt: caption.slice(0, 280) } : {}),
    ...(render?.previewUrl ? { previewUrl: render.previewUrl } : {}),
    ...(post.error ? { error: post.error } : {}),
    links: {
      content: `/app/renders/${encodeURIComponent(post.renderId)}`,
      ...(post.permalink ? { live: post.permalink } : {}),
      ...(status === "scheduled" ? { cancel: postUrl, reschedule: postUrl } : {}),
      ...(status === "failed" ? { retry: `${postUrl}/retry` } : {}),
    },
    timestamps: {
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      ...(post.publishAt ? { scheduledAt: post.publishAt, expectedPublishedAt: post.publishAt } : {}),
      ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
      ...(render?.completedAt ? { generatedAt: render.completedAt } : {}),
    },
  }
}

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim().slice(0, 80) ?? ""
}

export function calendarSummary(items: readonly CalendarItem[]): CalendarSummary {
  return {
    needsAction: items.filter((item) => item.status === "needs_action").length,
    failed: items.filter((item) => item.status === "failed").length,
    planned: items.filter((item) => item.status === "scheduled" || item.status === "publishing").length,
  }
}

export function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))
}

export function calendarTimingEntries(item: CalendarItem): CalendarTimingEntry[] {
  const generatedAt = item.timestamps.generatedAt
  const publishedAt = item.timestamps.publishedAt
  return [
    generatedAt
      ? { label: "Rendered on", at: generatedAt }
      : { label: "Expected to be rendered on", at: item.timestamps.expectedGenerationAt },
    publishedAt
      ? { label: "Published on", at: publishedAt }
      : { label: "Expected to be published on", at: item.timestamps.expectedPublishedAt },
  ]
}

export function calendarItemMatchesFilters(item: CalendarItem, filters: CalendarFilters) {
  return (
    matches(filters.statuses, [item.status]) &&
    matches(filters.automations, item.automationId ? [item.automationId] : []) &&
    matches(filters.sourceTypes, [item.sourceType]) &&
    matches(
      filters.accounts,
      item.targets.flatMap((target) => (target.integrationId ? [target.integrationId] : []))
    ) &&
    matches(
      filters.platforms,
      item.targets.map((target) => target.provider.toLowerCase())
    )
  )
}

export function reconcileCalendarFilterValue(value: string, availableValues: Iterable<string>) {
  if (value === "all") return value
  return new Set(availableValues).has(value) ? value : "all"
}

export function reconcileCalendarFilterValues(values: string[], availableValues: Iterable<string>) {
  const available = new Set(availableValues)
  return values.filter((value) => available.has(value))
}

function matches(filter: Set<string> | undefined, values: string[]) {
  return !filter?.size || values.some((value) => filter.has(value))
}
