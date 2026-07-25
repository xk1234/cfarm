import { describe, expect, it } from "vitest"

import { isAutomationConfigurationError } from "./slideshow-automation.js"

describe("slideshow automation configuration failures", () => {
  it("classifies deterministic missing-resource failures as configuration errors", () => {
    expect(
      isAutomationConfigurationError(
        new Error("No images are available for the automation collections")
      )
    ).toBe(true)
    expect(
      isAutomationConfigurationError(
        new Error(
          "Hook slot zodiac has no words in database collection zodiac"
        )
      )
    ).toBe(true)
  })

  it("does not pause an automation for transient provider failures", () => {
    expect(
      isAutomationConfigurationError(
        new Error("OpenRouter request failed with status 503")
      )
    ).toBe(false)
    expect(
      isAutomationConfigurationError(
        new Error("PostFast scheduling failed for 1 integration(s)")
      )
    ).toBe(false)
  })
})
