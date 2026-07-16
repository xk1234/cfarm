import { describe, expect, it } from "vitest"

import {
  calendarItemMatchesFilters,
  calendarLifecycleForJob,
  calendarLifecycleForLocalPost,
  calendarLifecycleForPostFast,
  dedupeCalendarItems,
  type CalendarItem,
} from "@/lib/calendar-items"

describe("calendar lifecycle mapping", () => {
  it("maps queue, local post, and PostFast states to the canonical lifecycle", () => {
    expect(calendarLifecycleForJob("queued")).toBe("generating")
    expect(calendarLifecycleForJob("processing")).toBe("generating")
    expect(calendarLifecycleForJob("dead")).toBe("generation_failed")
    expect(calendarLifecycleForJob("completed")).toBeNull()
    expect(calendarLifecycleForLocalPost("awaiting_manual_post")).toBe(
      "needs_action"
    )
    expect(calendarLifecycleForLocalPost("draft")).toBe("draft")
    expect(calendarLifecycleForLocalPost("failed")).toBe("failed")
    expect(calendarLifecycleForLocalPost("scheduled")).toBeNull()
    expect(calendarLifecycleForPostFast("SCHEDULED")).toBe("scheduled")
    expect(calendarLifecycleForPostFast("PUBLISHED")).toBe("published")
    expect(calendarLifecycleForPostFast("FAILED")).toBeNull()
  })
})

describe("calendar item merging", () => {
  it("replaces only the exact projected automation slot", () => {
    const first = calendarItem({ id: "planned:first", source: "projection" })
    const second = calendarItem({
      id: "planned:second",
      source: "projection",
      slot: "2026-07-15T01:01:00.000Z",
      datetime: "2026-07-15T01:01:00.000Z",
    })
    const actual = calendarItem({
      id: "job:1",
      source: "job",
      status: "generating",
    })

    expect(dedupeCalendarItems([first, second, actual])).toEqual([
      actual,
      second,
    ])
  })

  it("matches multi-value account, platform, lifecycle, automation, and source filters", () => {
    const item = calendarItem({
      source: "local_post",
      sourceType: "automation",
      status: "needs_action",
      targets: [
        {
          integrationId: "account-1",
          integrationName: "Creator",
          provider: "tiktok",
          status: "needs_action",
        },
      ],
    })
    expect(
      calendarItemMatchesFilters(item, {
        accounts: new Set(["account-1", "account-2"]),
        platforms: new Set(["instagram", "tiktok"]),
        statuses: new Set(["needs_action"]),
        automations: new Set(["automation-1"]),
        sourceTypes: new Set(["automation"]),
      })
    ).toBe(true)
  })
})

function calendarItem(
  overrides: Partial<CalendarItem> & Pick<CalendarItem, "source">
): CalendarItem {
  return {
    id: "planned:first",
    status: "planned",
    datetime: "2026-07-15T01:00:00.000Z",
    slot: "2026-07-15T01:00:00.000Z",
    timezone: "Asia/Singapore",
    automationId: "automation-1",
    automationName: "Morning posts",
    targets: [],
    sourceType: "automation",
    sourceId: "automation-1",
    title: "Planned content slot",
    links: {},
    timestamps: {},
    ...overrides,
  }
}
