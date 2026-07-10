import { describe, expect, it } from "vitest"

import {
  hasNearDuplicateText,
  normalizedTextSignature,
  trigramJaccardSimilarity,
} from "@/lib/text-similarity"

describe("text similarity", () => {
  it("normalizes generated output text into a stable signature", () => {
    expect(normalizedTextSignature(["  The Big Hook!", "Body text... "])).toBe(
      "the big hook body text"
    )
  })

  it("scores near-identical text above unrelated text", () => {
    const near = trigramJaccardSimilarity(
      "three habits that make you disciplined today",
      "3 habits that make you disciplined today"
    )
    const unrelated = trigramJaccardSimilarity(
      "three habits that make you disciplined today",
      "zodiac gifts for summer birthdays"
    )

    expect(near).toBeGreaterThan(0.85)
    expect(unrelated).toBeLessThan(0.35)
  })

  it("detects near duplicates against prior generated outputs", () => {
    expect(
      hasNearDuplicateText(
        "three habits that make you disciplined today",
        ["three habits that make you disciplined today"],
        { threshold: 0.85 }
      )
    ).toBe(true)
    expect(
      hasNearDuplicateText(
        "zodiac gifts for summer birthdays",
        ["three habits that make you disciplined today"],
        { threshold: 0.85 }
      )
    ).toBe(false)
  })
})
