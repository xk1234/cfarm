import { describe, expect, it } from "vitest"

import { buildSwipeSearchIndex, searchSwipes, tokenize } from "@/lib/swipe-search"
import type { SwipeRecord } from "@/lib/swipes"

function swipe(overrides: Partial<SwipeRecord>): SwipeRecord {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    advertiser: "",
    platform: "facebook",
    source: "",
    sourceUrl: "",
    title: "",
    caption: "",
    format: "video",
    swipedAt: "2026-07-01T00:00:00.000Z",
    metadata: {},
    stats: {},
    folder: "No Folder",
    ...overrides,
  }
}

describe("tokenize", () => {
  it("lowercases, splits on non-alphanumerics, drops stopwords and single chars", () => {
    expect(tokenize("No-Drill Curtains, for the RENTER!")).toEqual([
      "no",
      "drill",
      "curtains",
      "renter",
    ])
  })

  it("returns [] for empty/nullish", () => {
    expect(tokenize("")).toEqual([])
    expect(tokenize(undefined)).toEqual([])
  })
})

describe("searchSwipes", () => {
  const swipes = [
    swipe({
      id: "a",
      advertiser: "CurtainCo",
      title: "No drill curtains",
      tags: ["renter", "no-drill"],
      full_script_transcription: {
        speakers: [],
        full_text: "these curtains transformed my bedroom in ten minutes",
        pause_notes: [],
        emotional_tone_notes: [],
      },
    }),
    swipe({
      id: "b",
      advertiser: "BlindsBrand",
      title: "Blackout blinds review",
      caption: "morning glare fix",
    }),
  ]

  it("AND-matches every query token", () => {
    const res = searchSwipes(swipes, "curtains bedroom")
    expect(res.map((r) => r.swipe.id)).toEqual(["a"])
  })

  it("returns nothing when a token matches no field", () => {
    expect(searchSwipes(swipes, "curtains skyscraper")).toEqual([])
  })

  it("ranks advertiser/title/tag hits above transcription-only hits", () => {
    const res = searchSwipes(swipes, "curtains")
    expect(res[0].swipe.id).toBe("a")
    expect(res[0].score).toBeGreaterThan(0)
  })

  it("supports prefix matches (curtain -> curtains)", () => {
    expect(searchSwipes(swipes, "curtain").map((r) => r.swipe.id)).toContain("a")
  })

  it("respects the limit", () => {
    const many = [...swipes, swipe({ id: "c", advertiser: "CurtainWorld" })]
    expect(searchSwipes(many, "curtain", { limit: 1 })).toHaveLength(1)
  })

  it("is deterministic given a prebuilt index", () => {
    const index = buildSwipeSearchIndex(swipes)
    const a = searchSwipes(swipes, "glare", { index })
    const b = searchSwipes(swipes, "glare", { index })
    expect(a).toEqual(b)
    expect(a[0].swipe.id).toBe("b")
  })
})
