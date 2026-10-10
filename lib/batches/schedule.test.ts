import { describe, expect, it } from "vitest"

import type { BatchScheduleConfig } from "@/lib/data/types"

import {
  computeSchedule,
  evenlySpacedTimes,
  normalizeScheduleConfig,
  ScheduleError,
  type ScheduleInput,
} from "./schedule"

const NOW = new Date("2026-10-01T00:00:00.000Z")

function config(
  input: Partial<ScheduleInput> = {},
  now = NOW
): BatchScheduleConfig {
  const result = normalizeScheduleConfig(
    {
      accountIds: ["A"],
      timezone: "America/New_York",
      startDate: "2026-10-12",
      jitterMinutes: 0,
      ...input,
    },
    { now }
  )
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.config
}

const slotsOf = (slots: ReturnType<typeof computeSchedule>) =>
  slots.map((s) => [s.accountId, s.localTime])

describe("normalizeScheduleConfig", () => {
  it("fills defaults: three daily times, cap 3, 0–10 min jitter, schedule mode", () => {
    const result = normalizeScheduleConfig(
      { accountIds: ["1"] },
      { now: NOW, defaultTimezone: "Europe/Berlin" }
    )
    expect(result.ok && result.config).toMatchObject({
      accountIds: ["1"],
      timezone: "Europe/Berlin",
      startDate: "2026-10-01",
      timesOfDay: ["09:00", "13:00", "19:00"],
      maxPerAccountPerDay: 3,
      skipOccupied: true,
      jitterMinutes: { min: 0, max: 10 },
      mode: "schedule",
      privacyStatus: null,
    })
  })

  it("defaults the start date to today in the schedule timezone", () => {
    // 2026-10-01T00:00Z is still Sep 30 in New York.
    const result = normalizeScheduleConfig(
      { accountIds: ["1"], timezone: "America/New_York" },
      { now: NOW }
    )
    expect(result.ok && result.config.startDate).toBe("2026-09-30")
  })

  it("derives evenly spaced times from postsPerDay and a window", () => {
    expect(evenlySpacedTimes(3, { start: "09:00", end: "21:00" })).toEqual([
      "11:00",
      "15:00",
      "19:00",
    ])
    const result = normalizeScheduleConfig(
      {
        accountIds: ["1"],
        postsPerDay: 2,
        window: { start: "10:00", end: "14:00" },
      },
      { now: NOW }
    )
    expect(result.ok && result.config.timesOfDay).toEqual(["11:00", "13:00"])
  })

  it("sorts and dedupes times of day", () => {
    expect(
      config({ timesOfDay: ["19:00", "09:00", "19:00"] }).timesOfDay
    ).toEqual(["09:00", "19:00"])
  })

  it("reports every invalid field with a JSON pointer", () => {
    const bad = normalizeScheduleConfig(
      {
        accountIds: ["1", "1"],
        timezone: "Mars/Olympus",
        startDate: "2026-02-30",
        timesOfDay: ["09:00"],
        postsPerDay: 2,
        jitterMinutes: { min: 9, max: 3 },
      },
      { now: NOW }
    )
    expect(bad.ok).toBe(false)
    const paths = !bad.ok ? bad.errors.map((e) => e.path) : []
    expect(paths).toEqual(
      expect.arrayContaining([
        "/schedule/timezone",
        "/schedule/startDate",
        "/schedule/postsPerDay",
        "/schedule/jitterMinutes",
        "/schedule/accountIds",
      ])
    )
    const window = normalizeScheduleConfig(
      {
        accountIds: ["1"],
        postsPerDay: 2,
        window: { start: "18:00", end: "09:00" },
      },
      { now: NOW }
    )
    expect(!window.ok && window.errors[0]?.path).toBe("/schedule/window")
    const shape = normalizeScheduleConfig(
      { accountIds: [], timesOfDay: ["9am"] },
      { now: NOW }
    )
    expect(!shape.ok && shape.errors.map((e) => e.path)).toEqual([
      "/schedule/accountIds",
      "/schedule/timesOfDay/0",
    ])
  })
})

describe("computeSchedule", () => {
  it("deals items round-robin across accounts on each account's daily grid", () => {
    const slots = computeSchedule({
      itemCount: 5,
      config: config({ accountIds: ["A", "B"] }),
      now: NOW,
      seed: "s",
    })
    expect(slots.map((s) => s.index)).toEqual([0, 1, 2, 3, 4])
    expect(slotsOf(slots)).toEqual([
      ["A", "2026-10-12 09:00"],
      ["B", "2026-10-12 09:00"],
      ["A", "2026-10-12 13:00"],
      ["B", "2026-10-12 13:00"],
      ["A", "2026-10-12 19:00"],
    ])
    // New York is UTC-4 in October.
    expect(slots[0]!.publishAt).toBe("2026-10-12T13:00:00.000Z")
  })

  it("converts the same wall-clock grid per timezone", () => {
    const tokyo = computeSchedule({
      itemCount: 1,
      config: config({ timezone: "Asia/Tokyo" }),
      now: NOW,
      seed: "s",
    })
    expect(tokyo[0]!.publishAt).toBe("2026-10-12T00:00:00.000Z")
    const kolkata = computeSchedule({
      itemCount: 1,
      config: config({ timezone: "Asia/Kolkata" }),
      now: NOW,
      seed: "s",
    })
    expect(kolkata[0]!.publishAt).toBe("2026-10-12T03:30:00.000Z")
  })

  it("caps posts per account per day and rolls over to the next day", () => {
    const slots = computeSchedule({
      itemCount: 5,
      config: config({ maxPerAccountPerDay: 2 }),
      now: NOW,
      seed: "s",
    })
    expect(slots.map((s) => s.localTime)).toEqual([
      "2026-10-12 09:00",
      "2026-10-12 13:00",
      "2026-10-13 09:00",
      "2026-10-13 13:00",
      "2026-10-14 09:00",
    ])
  })

  it("skips slots near an existing post of the same account and counts it toward the cap", () => {
    const occupied = [
      { accountId: "A", at: "2026-10-12T17:10:00.000Z" }, // 13:10 local, within 30 min of 13:00
      { accountId: "B", at: "2026-10-12T13:00:00.000Z" }, // other account: ignored for A
    ]
    const slots = computeSchedule({
      itemCount: 3,
      config: config(),
      occupied,
      now: NOW,
      seed: "s",
    })
    // 13:00 is blocked and the existing post uses one of the three daily posts.
    expect(slots.map((s) => s.localTime)).toEqual([
      "2026-10-12 09:00",
      "2026-10-12 19:00",
      "2026-10-13 09:00",
    ])
  })

  it("treats a full day of existing posts as unavailable", () => {
    const occupied = [
      { accountId: "A", at: "2026-10-12T11:00:00.000Z" },
      { accountId: "A", at: "2026-10-12T23:30:00.000Z" },
    ]
    const slots = computeSchedule({
      itemCount: 1,
      config: config({ maxPerAccountPerDay: 2 }),
      occupied,
      now: NOW,
      seed: "s",
    })
    expect(slots[0]!.localTime).toBe("2026-10-13 09:00")
  })

  it("ignores existing posts when skipOccupied is false", () => {
    const occupied = [{ accountId: "A", at: "2026-10-12T13:00:00.000Z" }]
    const slots = computeSchedule({
      itemCount: 1,
      config: config({ skipOccupied: false }),
      occupied,
      now: NOW,
      seed: "s",
    })
    expect(slots[0]!.localTime).toBe("2026-10-12 09:00")
  })

  it("never schedules before now + lead time", () => {
    const now = new Date("2026-10-12T14:00:00.000Z") // 10:00 in New York
    const slots = computeSchedule({
      itemCount: 2,
      config: config({ minLeadMinutes: 15 }),
      now,
      seed: "s",
    })
    expect(slots.map((s) => s.localTime)).toEqual([
      "2026-10-12 13:00",
      "2026-10-12 19:00",
    ])
    const tight = computeSchedule({
      itemCount: 1,
      config: config({ minLeadMinutes: 200 }), // 13:20 local earliest
      now,
      seed: "s",
    })
    expect(tight[0]!.localTime).toBe("2026-10-12 19:00")
  })

  it("moves a slot inside the spring-forward gap by the gap (America/New_York)", () => {
    const slots = computeSchedule({
      itemCount: 2,
      config: config({ startDate: "2026-03-08", timesOfDay: ["02:30"] }),
      now: new Date("2026-03-01T00:00:00.000Z"),
      seed: "s",
    })
    expect(slots[0]).toMatchObject({
      publishAt: "2026-03-08T07:30:00.000Z",
      localTime: "2026-03-08 03:30",
    })
    expect(slots[1]).toMatchObject({
      publishAt: "2026-03-09T06:30:00.000Z",
      localTime: "2026-03-09 02:30",
    })
  })

  it("uses the earlier offset for an ambiguous fall-back time", () => {
    const slots = computeSchedule({
      itemCount: 2,
      config: config({ startDate: "2026-11-01", timesOfDay: ["01:30"] }),
      now: new Date("2026-10-20T00:00:00.000Z"),
      seed: "s",
    })
    expect(slots[0]!.publishAt).toBe("2026-11-01T05:30:00.000Z") // EDT (UTC-4)
    expect(slots[1]!.publishAt).toBe("2026-11-02T06:30:00.000Z") // EST (UTC-5)
  })

  it("keeps calendar days across a DST change (Europe/London)", () => {
    const slots = computeSchedule({
      itemCount: 3,
      config: config({
        timezone: "Europe/London",
        startDate: "2026-10-24",
        timesOfDay: ["09:00"],
      }),
      now: NOW,
      seed: "s",
    })
    expect(slots.map((s) => s.publishAt)).toEqual([
      "2026-10-24T08:00:00.000Z",
      "2026-10-25T09:00:00.000Z",
      "2026-10-26T09:00:00.000Z",
    ])
  })

  it("adds deterministic jitter within the configured range", () => {
    const cfg = config({
      jitterMinutes: { min: 2, max: 10 },
      accountIds: ["A", "B"],
    })
    const a = computeSchedule({
      itemCount: 12,
      config: cfg,
      now: NOW,
      seed: "batch-1",
    })
    const again = computeSchedule({
      itemCount: 12,
      config: cfg,
      now: NOW,
      seed: "batch-1",
    })
    const other = computeSchedule({
      itemCount: 12,
      config: cfg,
      now: NOW,
      seed: "batch-2",
    })
    expect(again).toEqual(a)
    expect(other.map((s) => s.publishAt)).not.toEqual(a.map((s) => s.publishAt))
    for (const slot of a) {
      const minute = Number(slot.localTime.slice(-2))
      expect(minute).toBeGreaterThanOrEqual(2)
      expect(minute).toBeLessThanOrEqual(10)
    }
  })

  it("keeps the minimum gap between the batch's own posts of one account", () => {
    const slots = computeSchedule({
      itemCount: 2,
      config: config({ timesOfDay: ["09:00", "09:10"] }),
      now: NOW,
      seed: "s",
    })
    expect(slots.map((s) => s.localTime)).toEqual([
      "2026-10-12 09:00",
      "2026-10-13 09:00",
    ])
    const loose = computeSchedule({
      itemCount: 2,
      config: config({ timesOfDay: ["09:00", "09:10"], minGapMinutes: 5 }),
      now: NOW,
      seed: "s",
    })
    expect(loose.map((s) => s.localTime)).toEqual([
      "2026-10-12 09:00",
      "2026-10-12 09:10",
    ])
  })

  it("can pin items to accounts (retrying one item)", () => {
    const slots = computeSchedule({
      itemCount: 2,
      config: config({ accountIds: ["A", "B"] }),
      now: NOW,
      seed: "s",
      accountForItem: () => "B",
    })
    expect(slotsOf(slots)).toEqual([
      ["B", "2026-10-12 09:00"],
      ["B", "2026-10-12 13:00"],
    ])
  })

  it("fails when a year is not enough", () => {
    expect(() =>
      computeSchedule({
        itemCount: 400,
        config: config({ timesOfDay: ["09:00"], maxPerAccountPerDay: 1 }),
        now: NOW,
        seed: "s",
      })
    ).toThrow(ScheduleError)
  })
})
