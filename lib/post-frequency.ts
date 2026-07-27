/**
 * Bucket generated posts into a GitHub-style activity grid.
 *
 * Pure and timezone-explicit so the grid can be unit-tested without rendering:
 * an off-by-one day boundary is the classic bug here, and it is invisible in a
 * screenshot.
 */

export type ActivityDay = {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string
  count: number
  /** 0-4, for colour intensity. 0 means no posts. */
  level: number
}

export type ActivityGrid = {
  /** Columns, oldest first. Each column is Sun..Sat, so rows align by weekday. */
  weeks: ActivityDay[][]
  total: number
  busiestCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Local `YYYY-MM-DD`. Deliberately not `toISOString()`, which is UTC and
 *  silently shifts every post across the date line for non-UTC users. */
export function localDayKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Levels are relative to the busiest day, so a light week still shows contrast
 * rather than a uniformly pale grid.
 */
function levelFor(count: number, busiest: number) {
  if (count <= 0) return 0
  if (busiest <= 1) return 4
  const ratio = count / busiest
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

export function buildActivityGrid(
  dates: Array<string | undefined | null>,
  options: { weeks?: number; today?: Date } = {}
): ActivityGrid {
  const weekCount = Math.max(1, options.weeks ?? 26)
  const today = options.today ?? new Date()

  const counts = new Map<string, number>()
  let total = 0
  for (const raw of dates) {
    if (!raw) continue
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) continue
    const key = localDayKey(parsed)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    total += 1
  }

  // End on the Saturday of the current week so the final column is whole and
  // "today" never sits in a half-drawn column.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  end.setDate(end.getDate() + (6 - end.getDay()))
  const start = new Date(end.getTime() - (weekCount * 7 - 1) * DAY_MS)

  const busiestCount = Math.max(0, ...counts.values())
  const weeks: ActivityDay[][] = []
  for (let week = 0; week < weekCount; week += 1) {
    const column: ActivityDay[] = []
    for (let day = 0; day < 7; day += 1) {
      const cursor = new Date(start.getTime() + (week * 7 + day) * DAY_MS)
      const key = localDayKey(cursor)
      const count = counts.get(key) ?? 0
      column.push({ date: key, count, level: levelFor(count, busiestCount) })
    }
    weeks.push(column)
  }

  return { weeks, total, busiestCount }
}

/** Longest run of consecutive days with at least one post, ending today. */
export function currentStreak(grid: ActivityGrid, today = new Date()) {
  const days = grid.weeks.flat()
  const todayKey = localDayKey(today)
  const index = days.findIndex((day) => day.date === todayKey)
  if (index < 0) return 0
  let streak = 0
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (days[cursor].count <= 0) break
    streak += 1
  }
  return streak
}
