import type { PostStatus } from "@/lib/data/types"

export type CalendarPostLike = {
  id: string
  status: PostStatus
  publishAt: string | null
  publishedAt: string | null
  createdAt: string
}

/** Local `YYYY-MM-DD` for a date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** When a post sits on the calendar: published time, else scheduled time, else creation. */
export function postCalendarTime(post: CalendarPostLike): Date {
  return new Date(post.publishedAt ?? post.publishAt ?? post.createdAt)
}

/** 6 weeks of days (Monday first) covering the month of `anchor`. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset)
  return Array.from(
    { length: 42 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  )
}

/** ISO range `[from, to)` covering the visible grid. */
export function gridRange(anchor: Date): { from: string; to: string } {
  const days = monthGrid(anchor)
  const last = days[days.length - 1]
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  return { from: days[0].toISOString(), to: end.toISOString() }
}

export function groupPostsByDay<T extends CalendarPostLike>(posts: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  const sorted = [...posts]
    .filter((post) => post.status !== "canceled")
    .sort((a, b) => postCalendarTime(a).getTime() - postCalendarTime(b).getTime())
  for (const post of sorted) {
    const key = dayKey(postCalendarTime(post))
    map.set(key, [...(map.get(key) ?? []), post])
  }
  return map
}

export function shiftMonth(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  canceled: "Canceled",
}
