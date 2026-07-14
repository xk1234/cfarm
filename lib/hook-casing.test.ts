import { describe, expect, it } from "vitest"

import { applyHookCase, applyResolvedHookCase, detectHookCaseMode } from "@/lib/hook-casing"

describe("hook casing", () => {
  it("changes non-variable text while keeping variables uppercase", () => {
    expect(applyHookCase("WHY [[zodiac]] Women ARE unforgettable", "lowercase"))
      .toBe("why [[ZODIAC]] women are unforgettable")
    expect(applyHookCase("why [[zodiac]] women are unforgettable", "title"))
      .toBe("Why [[ZODIAC]] Women Are Unforgettable")
    expect(applyHookCase("why [[zodiac]] WOMEN are unforgettable", "sentence"))
      .toBe("Why [[ZODIAC]] women are unforgettable")
  })

  it("applies the selected mode after variables resolve", () => {
    expect(applyResolvedHookCase("Why Aries Women Are Unforgettable", "lowercase"))
      .toBe("why aries women are unforgettable")
    expect(applyResolvedHookCase("why aries women are unforgettable", "uppercase"))
      .toBe("WHY ARIES WOMEN ARE UNFORGETTABLE")
  })

  it("only reports mixed when no consistent mode is detected", () => {
    expect(detectHookCaseMode(["all lowercase", "another [[TAG]] hook"]))
      .toBe("lowercase")
    expect(detectHookCaseMode(["Title Case Hook", "sentence case hook"])).toBe("mixed")
  })
})
