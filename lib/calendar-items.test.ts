import { describe, expect, it } from "vitest"

import {
  calendarItemMatchesFilters,
  calendarLifecycleForJob,
  calendarLifecycleForLocalPost,
  calendarLifecycleForPostFast,
  calendarTimingEntries,
  dedupeCalendarItems,
  reconcileCalendarFilterValue,
  reconcileCalendarFilterValues,
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

describe("calendar hover timing", () => {
  it("prefers actual generation and publication timestamps", () => {
    const item = calendarItem({
      source: "postfast",
      timestamps: {
        generatedAt: "2026-07-15T00:32:00.000Z",
        expectedGenerationAt: "2026-07-15T00:30:00.000Z",
        publishedAt: "2026-07-15T01:01:00.000Z",
        expectedPublishedAt: "2026-07-15T01:00:00.000Z",
      },
    })

    expect(calendarTimingEntries(item)).toEqual([
      { label: "Generated on", at: "2026-07-15T00:32:00.000Z" },
      { label: "Published on", at: "2026-07-15T01:01:00.000Z" },
    ])
  })

  it("uses expected scheduler timestamps before generation and publishing", () => {
    const item = calendarItem({
      source: "projection",
      timestamps: {
        expectedGenerationAt: "2026-07-15T00:30:00.000Z",
        expectedPublishedAt: "2026-07-15T01:00:00.000Z",
      },
    })

    expect(calendarTimingEntries(item)).toEqual([
      {
        label: "Expected to be generated on",
        at: "2026-07-15T00:30:00.000Z",
      },
      {
        label: "Expected to be published on",
        at: "2026-07-15T01:00:00.000Z",
      },
    ])
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

describe("calendar filter availability", () => {
  it("replaces stale single values and removes stale multi-select values", () => {
    expect(
      reconcileCalendarFilterValue("deleted-automation", ["automation-1"])
    ).toBe("all")
    expect(reconcileCalendarFilterValue("automation-1", ["automation-1"])).toBe(
      "automation-1"
    )
    expect(
      reconcileCalendarFilterValues(
        ["deleted-account", "account-1"],
        ["account-1", "account-2"]
      )
    ).toEqual(["account-1"])
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
