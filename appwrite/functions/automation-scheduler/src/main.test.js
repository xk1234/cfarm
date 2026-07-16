import { Query } from "node-appwrite"
import { describe, expect, it, vi } from "vitest"

import {
  dueSlots,
  listLiveAutomations,
  SLIDESHOW_GENERATION_LEAD_MINUTES,
} from "./main.js"

function schema(time, days) {
  return {
    schedule: {
      timezone: "Asia/Singapore",
      posting_times: [{ time, days }],
    },
  }
}

describe("automation scheduler due slots", () => {
  it("asks Appwrite for live rows instead of scanning paused automations", async () => {
    const listRows = vi.fn().mockResolvedValue({
      rows: [
        {
          $id: "automation-1",
          owner_id: "owner-1",
          data: JSON.stringify({ id: "automation-1", status: "live" }),
        },
      ],
    })

    await expect(listLiveAutomations({ listRows })).resolves.toHaveLength(1)
    expect(listRows).toHaveBeenCalledWith(
      "cfarm",
      "automations",
      expect.arrayContaining([Query.equal("status", ["live"])])
    )
  })

  it("queues slideshow generation 30 minutes before the posting slot", () => {
    const slots = dueSlots(
      schema("9:00 AM", ["Wed"]),
      new Date("2026-07-15T00:30:00.000Z"),
      10,
      SLIDESHOW_GENERATION_LEAD_MINUTES
    )

    expect(slots).toEqual(["2026-07-15T01:00:00.000Z"])
  })

  it("does not queue a zero-lead job before its posting slot", () => {
    const slots = dueSlots(
      schema("9:00 AM", ["Wed"]),
      new Date("2026-07-15T00:30:00.000Z"),
      10
    )

    expect(slots).toEqual([])
  })

  it("handles a lead window that crosses local midnight", () => {
    const slots = dueSlots(
      schema("12:15 AM", ["Wed"]),
      new Date("2026-07-14T15:45:00.000Z"),
      10,
      SLIDESHOW_GENERATION_LEAD_MINUTES
    )

    expect(slots).toEqual(["2026-07-14T16:15:00.000Z"])
  })

  it("keeps a just-missed previous-day slot inside the lookback", () => {
    const slots = dueSlots(
      schema("11:59 PM", ["Tue"]),
      new Date("2026-07-14T16:05:00.000Z"),
      10
    )

    expect(slots).toEqual(["2026-07-14T15:59:00.000Z"])
  })
})
