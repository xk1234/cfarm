import { describe, expect, it } from "vitest"

import {
  applyHookTextDirection,
  chooseImages,
  selectContentSlideCount,
} from "@/lib/automation-runner"

describe("automation runner image selection", () => {
  it("selects every varying slide-count boundary and ignores the legacy count", () => {
    const input = {
      mode: "varying" as const,
      count: 99,
      min: 3,
      max: 5,
    }

    expect(selectContentSlideCount({ ...input, random: () => 0 })).toEqual({
      count: 3,
      min: 3,
      max: 5,
    })
    expect(selectContentSlideCount({ ...input, random: () => 0.5 }).count).toBe(
      4
    )
    expect(selectContentSlideCount({ ...input, random: () => 1 }).count).toBe(5)
  })

  it("applies explicit hook casing and exclusive word limits without changing the stored direction", () => {
    const direction = "hook text, all lowercase. must be under 10 words total"

    expect(
      applyHookTextDirection(
        "If You Want A Real Friend Get A Scorpio Today Please",
        direction
      )
    ).toBe("if you want a real friend get a scorpio")
    expect(direction).toBe(
      "hook text, all lowercase. must be under 10 words total"
    )
  })

  it("never returns the same image twice within one slideshow", () => {
    const selected = chooseImages(
      [
        { key: "a", imageUrl: "/a.jpg" },
        { key: "b", imageUrl: "/b.jpg" },
        { key: "c", imageUrl: "/c.jpg" },
      ],
      5,
      () => 0
    )

    expect(selected.map((image) => image.imageUrl)).toEqual([
      "/a.jpg",
      "/b.jpg",
      "/c.jpg",
    ])
    expect(new Set(selected.map((image) => image.imageUrl)).size).toBe(
      selected.length
    )
  })

  it("deduplicates matching hashes and matching URLs", () => {
    const selected = chooseImages(
      [
        { key: "same-hash", imageUrl: "/first.jpg" },
        { key: "same-hash", imageUrl: "/duplicate-hash.jpg" },
        { key: "other-hash", imageUrl: "/first.jpg" },
        { key: "unique", imageUrl: "/unique.jpg" },
      ],
      4,
      () => 0
    )

    expect(selected).toEqual([
      { key: "same-hash", imageUrl: "/first.jpg" },
      { key: "unique", imageUrl: "/unique.jpg" },
    ])
  })
})
