import { describe, expect, it } from "vitest"

import {
  nextUpcomingAutomationPost,
  upcomingAutomationPosts,
} from "@/lib/automation-upcoming-posts"
import type { Automation } from "@/lib/realfarm-data"

describe("upcoming automation posts", () => {
  it("returns the next two posts with Today and Tomorrow labels", () => {
    const automation = scheduledAutomation([
      { time: "3:00 PM", days: ["Sat"] },
      { time: "9:00 AM", days: ["Sun"] },
    ])
    expect(
      upcomingAutomationPosts(
        automation,
        new Date("2026-07-11T04:00:00.000Z")
      ).map((post) => post.label)
    ).toEqual(["Today, 3:00 PM", "Tomorrow, 9:00 AM"])
  })

  it("uses weekday and date for posts beyond tomorrow", () => {
    const automation = scheduledAutomation([
      { time: "11:00 AM", days: ["Mon"] },
      { time: "4:30 PM", days: ["Wed"] },
    ])
    expect(
      upcomingAutomationPosts(
        automation,
        new Date("2026-07-11T04:00:00.000Z")
      ).map((post) => post.label)
    ).toEqual(["Mon, Jul 13, 11:00 AM", "Wed, Jul 15, 4:30 PM"])
  })

  it("skips disabled times and occurrences that already passed", () => {
    const automation = scheduledAutomation([
      { time: "8:00 AM", days: ["Sat"] },
      { time: "6:00 PM", days: ["Sat"] },
      { time: "9:00 AM", days: ["Sun"], enabled: false },
      { time: "10:00 AM", days: ["Sun"] },
    ])
    expect(
      upcomingAutomationPosts(
        automation,
        new Date("2026-07-11T04:00:00.000Z")
      ).map((post) => post.label)
    ).toEqual(["Today, 6:00 PM", "Tomorrow, 10:00 AM"])
  })

  it("selects the earliest post across live automations", () => {
    const later = scheduledAutomation([{ time: "6:00 PM", days: ["Sat"] }])
    const earlier = {
      ...scheduledAutomation([{ time: "3:00 PM", days: ["Sat"] }]),
      id: "automation-2",
      name: "Earlier automation",
    }
    const paused = {
      ...scheduledAutomation([{ time: "1:00 PM", days: ["Sat"] }]),
      id: "automation-3",
      status: "paused" as const,
    }

    expect(
      nextUpcomingAutomationPost(
        [later, paused, earlier],
        new Date("2026-07-11T04:00:00.000Z")
      )
    ).toMatchObject({
      automationId: "automation-2",
      automationName: "Earlier automation",
      label: "Today, 3:00 PM",
    })
  })
})

function scheduledAutomation(
  postingTimes: NonNullable<Automation["schedule"]>["posting_times"]
): Automation {
  return {
    id: "automation-1",
    name: "Automation",
    status: "live",
    account: "",
    handle: "",
    times: [],
    timezone: "Asia/Singapore",
    favorite: false,
    theme: "ugc",
    socialIntegrations: [],
    schedule: {
      timezone: "Asia/Singapore",
      posting_times: postingTimes,
    },
  }
}
