import { describe, expect, it } from "vitest"

import { lintAutomationHookText } from "@/lib/automation-hook-lint"

describe("automation hook lint", () => {
  it("warns when a numeric token is not followed by what it counts", () => {
    expect(
      lintAutomationHookText({
        id: "wealth",
        text: "[[SLIDE_COUNT]] destined for wealth in [[CURRENT_YEAR]]",
      })
    ).toEqual([
      expect.objectContaining({
        code: "NUMERIC_TOKEN_MISSING_NOUN",
        hookId: "wealth",
        token: "[[SLIDE_COUNT]]",
        followingWord: "destined",
      }),
    ])
  })

  it("accepts common counted noun phrases", () => {
    expect(
      lintAutomationHookText({
        text: "[[SLIDE_COUNT]] zodiac signs destined for wealth",
      })
    ).toEqual([])
    expect(
      lintAutomationHookText({ text: "[[NUMBER]] ways to attract money" })
    ).toEqual([])
  })
})
