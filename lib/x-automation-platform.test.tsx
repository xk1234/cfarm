import { describe, expect, it } from "vitest"

import { xThreadsPlatformForDisplay } from "@/lib/x-automation-platform"

describe("X and Threads display identity", () => {
  it("prefers the run platform and preserves an automation's saved platform", () => {
    const automation = {
      platform: "threads" as const,
      handle: "Click to add account",
      socialIntegrations: [],
    }

    expect(xThreadsPlatformForDisplay(automation)).toBe("threads")
    expect(xThreadsPlatformForDisplay(automation, "x")).toBe("x")
  })
})
