import { describe, expect, it } from "vitest"

import { dayKey, groupPostsByDay, monthGrid, postCalendarTime } from "./calendar-model"

describe("calendar model", () => {
  it("builds a Monday-first 6-week grid covering the month", () => {
    const days = monthGrid(new Date(2026, 9, 15))
    expect(days).toHaveLength(42)
    expect(days[0].getDay()).toBe(1)
    expect(days.some((day) => dayKey(day) === "2026-10-01")).toBe(true)
    expect(days.some((day) => dayKey(day) === "2026-10-31")).toBe(true)
  })

  it("places posts by published, then scheduled time and hides canceled posts", () => {
    const posts = [
      { id: "a", status: "scheduled" as const, publishAt: new Date(2026, 9, 12, 9).toISOString(), publishedAt: null, createdAt: new Date(2026, 9, 1).toISOString() },
      { id: "b", status: "published" as const, publishAt: new Date(2026, 9, 12, 8).toISOString(), publishedAt: new Date(2026, 9, 13, 8).toISOString(), createdAt: new Date(2026, 9, 1).toISOString() },
      { id: "c", status: "canceled" as const, publishAt: new Date(2026, 9, 12, 7).toISOString(), publishedAt: null, createdAt: new Date(2026, 9, 1).toISOString() },
    ]
    const byDay = groupPostsByDay(posts)
    expect(byDay.get("2026-10-12")?.map((p) => p.id)).toEqual(["a"])
    expect(byDay.get("2026-10-13")?.map((p) => p.id)).toEqual(["b"])
    expect(dayKey(postCalendarTime(posts[1]))).toBe("2026-10-13")
  })
})
