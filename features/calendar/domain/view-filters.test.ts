import { describe, expect, it } from "vitest"

import {
  calendarAccountOptions,
  calendarItemMatchesViewFilters,
  countCalendarViewFilters,
  normalizeStoredCalendarFilters,
  reconcileCalendarViewFilters,
} from "@/features/calendar/domain/view-filters"
import type { CalendarItem } from "@/features/calendar/domain/calendar"

const item: CalendarItem = {
  id: "local:one",
  status: "scheduled",
  datetime: "2026-08-12T08:00:00.000Z",
  timezone: "UTC",
  automationId: "template-1",
  automationName: "Template one",
  targets: [
    {
      integrationId: "account-1",
      integrationName: "Creator",
      provider: "tiktok",
      status: "scheduled",
    },
  ],
  source: "local_post",
  sourceType: "automation",
  sourceId: "run-1",
  title: "Scheduled post",
  links: {},
  timestamps: {},
}

describe("calendar view filters", () => {
  it("normalizes persisted values and drops removed lifecycle states", () => {
    expect(
      normalizeStoredCalendarFilters({
        accounts: ["account-1"],
        statuses: ["scheduled", "generation_failed"],
        platform: "tiktok",
      })
    ).toMatchObject({
      accounts: ["account-1"],
      statuses: ["scheduled"],
      platform: "tiktok",
    })
  })

  it("derives options and reconciles unavailable selections", () => {
    const accounts = calendarAccountOptions([item])
    const reconciled = reconcileCalendarViewFilters(
      {
        accounts: ["account-1", "removed"],
        statuses: ["scheduled"],
        platform: "removed",
        automation: "template-1",
        sourceType: "automation",
      },
      {
        accounts,
        platforms: [{ value: "tiktok", label: "TikTok" }],
        automations: [{ value: "template-1", label: "Template one" }],
        sourceTypes: [{ value: "automation", label: "Automation" }],
      }
    )

    expect(reconciled.accounts).toEqual(["account-1"])
    expect(reconciled.platform).toBe("all")
    expect(countCalendarViewFilters(reconciled)).toBe(4)
    expect(calendarItemMatchesViewFilters(item, reconciled)).toBe(true)
  })
})
