import { describe, expect, it } from "vitest"

import { viralTrackerUserMessage } from "./viral-tracker-view"

describe("viralTrackerUserMessage", () => {
  it("replaces provider and environment diagnostics with user-safe copy", () => {
    expect(
      viralTrackerUserMessage(
        "TikHub is not configured. Add TIKHUB_API_KEY to the server environment."
      )
    ).toBe(
      "Viral tracking is temporarily unavailable. Contact your workspace administrator."
    )
  })

  it("preserves errors a user can act on", () => {
    expect(viralTrackerUserMessage("Enter a valid TikTok handle")).toBe(
      "Enter a valid TikTok handle"
    )
  })
})
