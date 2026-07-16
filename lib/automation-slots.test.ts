import { describe, expect, it } from "vitest"

import {
  automationSlotsInRange,
  dueAutomationSlots,
  scheduleSlotsInRange,
} from "@/lib/automation-slots"
import type { Automation } from "@/lib/realfarm-data"

describe("automation slot projection", () => {
  it("projects enabled schedule slots in the automation timezone", () => {
    const automation: Automation = {
      id: "a-1",
      name: "Morning posts",
      status: "live",
      account: "Account",
      handle: "@account",
      times: [],
      timezone: "Asia/Singapore",
      schedule: {
        timezone: "Asia/Singapore",
        posting_times: [
          { time: "9:00 AM", days: ["Wed"], enabled: true },
          { time: "6:00 PM", days: ["Wed"], enabled: false },
        ],
      },
      favorite: false,
      theme: "ugc",
      socialIntegrations: [],
    }

    const slots = automationSlotsInRange(
      automation,
      new Date("2026-07-14T16:00:00.000Z"),
      new Date("2026-07-15T16:00:00.000Z")
    )

    expect(slots).toHaveLength(1)
    expect(slots[0].scheduledFor).toBe("2026-07-15T01:00:00.000Z")
  })

  it("uses the same schedule projection for due-run checks", () => {
    expect(
      dueAutomationSlots(
        {
          timezone: "Asia/Singapore",
          posting_times: [{ time: "9:00 AM", days: ["Wed"] }],
        },
        new Date("2026-07-15T01:04:00.000Z"),
        10
      )
    ).toEqual(["2026-07-15T01:00:00.000Z"])
  })

  it("supports legacy interval slots and applies jitter after due qualification", () => {
    expect(
      dueAutomationSlots(
        {
          timezone: "America/New_York",
          posting_times: [],
          interval: {
            every_n_hours: 3,
            start_time: "9:00 AM",
            end_time: "5:00 PM",
            days: ["Fri"],
          },
          jitter_minutes: 15,
        },
        new Date("2026-07-03T16:10:00.000Z"),
        10,
        0,
        () => 1
      )
    ).toEqual(["2026-07-03T16:15:00.000Z"])
  })

  it("uses stable jitter for projections so calendar and scheduler keys agree", () => {
    const schedule = {
      timezone: "Asia/Singapore",
      posting_times: [{ time: "9:00 AM" as const, days: ["Wed" as const] }],
      jitter_minutes: 12,
    }
    const from = new Date("2026-07-15T00:30:00.000Z")
    const to = new Date("2026-07-15T01:30:00.000Z")
    const projected = scheduleSlotsInRange(schedule, from, to)
    expect(projected).toHaveLength(1)
    expect(
      dueAutomationSlots(schedule, new Date("2026-07-15T01:00:00.000Z"), 0)
    ).toEqual(projected)
  })

  it("does not emit due slots for a paused schedule", () => {
    expect(
      dueAutomationSlots(
        {
          timezone: "UTC",
          posting_times: [{ time: "9:00 AM", days: [] }],
          paused: true,
        },
        new Date("2026-07-15T09:00:00.000Z"),
        10
      )
    ).toEqual([])
  })
})
