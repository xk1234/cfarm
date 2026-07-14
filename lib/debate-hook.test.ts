import { describe, expect, it } from "vitest"

import { splitDebateHook } from "@/lib/debate-hook"

describe("debate hook", () => {
  it("splits exactly two opposing statements", () => {
    expect(splitDebateHook('"I wait until I’m ready" || "I start before I’m ready"'))
      .toEqual(['"I wait until I’m ready"', '"I start before I’m ready"'])
  })

  it("leaves ordinary hooks on the existing single-text path", () => {
    expect(splitDebateHook("A normal slideshow hook")).toBeNull()
    expect(splitDebateHook("one || two || three")).toBeNull()
  })
})
