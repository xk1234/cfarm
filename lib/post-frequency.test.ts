import { describe, expect, it } from "vitest"

import {
  buildActivityGrid,
  currentStreak,
  localDayKey,
} from "@/lib/post-frequency"

// A Wednesday, so the week-boundary logic has something to pad on both sides.
const TODAY = new Date(2026, 6, 15, 12, 0, 0)

describe("buildActivityGrid", () => {
  it("returns whole Sun..Sat columns covering the requested window", () => {
    const grid = buildActivityGrid([], { weeks: 4, today: TODAY })
    expect(grid.weeks).toHaveLength(4)
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true)
    // Every column starts on a Sunday, so rows line up by weekday.
    for (const week of grid.weeks) {
      expect(new Date(`${week[0].date}T00:00:00`).getDay()).toBe(0)
    }
  })

  it("ends on the current week, with today inside the grid", () => {
    const grid = buildActivityGrid([], { weeks: 4, today: TODAY })
    const days = grid.weeks.flat().map((day) => day.date)
    expect(days).toContain(localDayKey(TODAY))
  })

  it("counts several posts on the same day into one cell", () => {
    const grid = buildActivityGrid(
      [
        new Date(2026, 6, 14, 9).toISOString(),
        new Date(2026, 6, 14, 18).toISOString(),
        new Date(2026, 6, 13, 9).toISOString(),
      ],
      { weeks: 4, today: TODAY }
    )
    const byDate = new Map(grid.weeks.flat().map((day) => [day.date, day]))
    expect(byDate.get("2026-07-14")?.count).toBe(2)
    expect(byDate.get("2026-07-13")?.count).toBe(1)
    expect(grid.total).toBe(3)
  })

  it("uses the LOCAL day, not UTC", () => {
    // 23:30 local on the 14th is already the 15th in UTC. Bucketing by
    // toISOString() would file this post under the wrong day for anyone east
    // of UTC, which is exactly the kind of bug a screenshot cannot show.
    const lateEvening = new Date(2026, 6, 14, 23, 30)
    const grid = buildActivityGrid([lateEvening.toISOString()], {
      weeks: 4,
      today: TODAY,
    })
    const byDate = new Map(grid.weeks.flat().map((day) => [day.date, day]))
    expect(byDate.get("2026-07-14")?.count).toBe(1)
  })

  it("ignores unparseable and missing dates instead of throwing", () => {
    const grid = buildActivityGrid([undefined, null, "", "not-a-date"], {
      weeks: 4,
      today: TODAY,
    })
    expect(grid.total).toBe(0)
    expect(grid.weeks.flat().every((day) => day.level === 0)).toBe(true)
  })

  it("scales levels against the busiest day so a light week still contrasts", () => {
    const dates = [
      ...Array.from({ length: 8 }, () => new Date(2026, 6, 14, 9).toISOString()),
      new Date(2026, 6, 13, 9).toISOString(),
    ]
    const grid = buildActivityGrid(dates, { weeks: 4, today: TODAY })
    const byDate = new Map(grid.weeks.flat().map((day) => [day.date, day]))
    expect(byDate.get("2026-07-14")?.level).toBe(4)
    const quiet = byDate.get("2026-07-13")!
    expect(quiet.level).toBeGreaterThan(0)
    expect(quiet.level).toBeLessThan(4)
  })
})

describe("currentStreak", () => {
  it("counts back from today while days have posts", () => {
    const dates = [13, 14, 15].map((day) =>
      new Date(2026, 6, day, 9).toISOString()
    )
    const grid = buildActivityGrid(dates, { weeks: 4, today: TODAY })
    expect(currentStreak(grid, TODAY)).toBe(3)
  })

  it("is zero when today has no posts, however busy yesterday was", () => {
    const grid = buildActivityGrid(
      [new Date(2026, 6, 14, 9).toISOString()],
      { weeks: 4, today: TODAY }
    )
    expect(currentStreak(grid, TODAY)).toBe(0)
  })
})
