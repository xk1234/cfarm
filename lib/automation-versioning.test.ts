import { describe, expect, it } from "vitest"

import { nextAutomationUpdatedAt } from "@/lib/automations"

describe("automation mutation timestamps", () => {
  it("uses the write time when it is newer than the stored version", () => {
    expect(
      nextAutomationUpdatedAt(
        "2026-07-24T12:42:56.776Z",
        new Date("2026-07-27T01:00:00.000Z")
      )
    ).toBe("2026-07-27T01:00:00.000Z")
  })

  it("always advances the version even for same-tick or stale clocks", () => {
    expect(
      nextAutomationUpdatedAt(
        "2026-07-27T01:00:00.000Z",
        new Date("2026-07-27T01:00:00.000Z")
      )
    ).toBe("2026-07-27T01:00:00.001Z")
    expect(
      nextAutomationUpdatedAt(
        "2026-07-27T01:00:00.000Z",
        new Date("2026-07-26T23:00:00.000Z")
      )
    ).toBe("2026-07-27T01:00:00.001Z")
  })
})
