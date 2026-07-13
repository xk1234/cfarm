import { describe, expect, it } from "vitest"

import { sortAutomationRuns } from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

describe("automation overview run sorting", () => {
  const olderPopular = run("popular", "2026-07-01T10:00:00.000Z", 900)
  const newerQuiet = run("newer", "2026-07-10T10:00:00.000Z", 20)
  const newestQuiet = run("newest", "2026-07-11T10:00:00.000Z", 20)

  it("sorts recent slideshows by creation time", () => {
    expect(
      sortAutomationRuns([olderPopular, newerQuiet, newestQuiet], "Recent").map(
        (item) => item.id
      )
    ).toEqual(["newest", "newer", "popular"])
  })

  it("sorts most-viewed slideshows by views and breaks ties by recency", () => {
    expect(
      sortAutomationRuns(
        [newerQuiet, olderPopular, newestQuiet],
        "Most viewed"
      ).map((item) => item.id)
    ).toEqual(["popular", "newest", "newer"])
  })
})

function run(
  id: string,
  createdAt: string,
  views: number
): AutomationRunApiRecord {
  return {
    id,
    automationId: "automation-1",
    automationTitle: "Automation",
    scheduledFor: createdAt,
    createdAt,
    status: "succeeded",
    views,
  }
}
