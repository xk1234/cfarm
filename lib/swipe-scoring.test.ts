import { describe, expect, it } from "vitest"

import { rankSwipesByScore, rankToUnit, scoreSwipe } from "@/lib/swipe-scoring"
import type { SwipeRecord } from "@/lib/swipes"

const NOW = new Date("2026-07-08T00:00:00.000Z")

function swipe(overrides: Partial<SwipeRecord>): SwipeRecord {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    advertiser: "adv",
    platform: "facebook",
    source: "",
    sourceUrl: "",
    title: "",
    caption: "",
    format: "video",
    swipedAt: "2026-07-08T00:00:00.000Z",
    metadata: {},
    stats: {},
    folder: "No Folder",
    ...overrides,
  }
}

describe("rankToUnit", () => {
  it("maps ordinal ranks (1 best)", () => {
    expect(rankToUnit("1")).toBe(1)
    expect(rankToUnit("#2")).toBeCloseTo(0.95, 5)
    expect(rankToUnit("21")).toBe(0)
  })
  it("maps top-percent ranks", () => {
    expect(rankToUnit("Top 1%")).toBeCloseTo(0.99, 5)
    expect(rankToUnit("top 50 %")).toBeCloseTo(0.5, 5)
  })
  it("returns null for missing/unparseable", () => {
    expect(rankToUnit(undefined)).toBeNull()
    expect(rankToUnit("n/a")).toBeNull()
  })
})

describe("scoreSwipe", () => {
  it("is deterministic and bounded 0..100", () => {
    const s = scoreSwipe(
      swipe({ likes: 5000, comments: 200, ctr_rank: "Top 5%" }),
      { now: NOW }
    )
    const s2 = scoreSwipe(
      swipe({ likes: 5000, comments: 200, ctr_rank: "Top 5%" }),
      { now: NOW }
    )
    expect(s.score).toEqual(s2.score)
    expect(s.score).toBeGreaterThan(0)
    expect(s.score).toBeLessThanOrEqual(100)
  })

  it("rewards a long-running ad over a brand-new one with equal engagement", () => {
    const longRunner = scoreSwipe(
      swipe({
        likes: 1000,
        first_seen_at: "2026-05-01T00:00:00.000Z",
        last_seen_at: "2026-07-08T00:00:00.000Z",
      }),
      { now: NOW }
    )
    const fresh = scoreSwipe(swipe({ likes: 1000 }), { now: NOW })
    expect(longRunner.breakdown.longevity).toBeGreaterThan(
      fresh.breakdown.longevity
    )
    expect(longRunner.score).toBeGreaterThan(fresh.score)
  })

  it("zeroes components with no signal", () => {
    const s = scoreSwipe(swipe({ swipedAt: "" }), { now: NOW })
    expect(s.breakdown.engagement).toBe(0)
    expect(s.breakdown.performance).toBe(0)
    expect(s.breakdown.recency).toBe(0)
  })

  it("ranks winners first", () => {
    const ranked = rankSwipesByScore(
      [
        swipe({ id: "weak" }),
        swipe({ id: "strong", likes: 50000, comments: 4000, ctr_rank: "1" }),
      ],
      { now: NOW }
    )
    expect(ranked[0].swipe.id).toBe("strong")
  })
})
