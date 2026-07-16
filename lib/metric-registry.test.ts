import { describe, expect, it } from "vitest"

import {
  normalizeMetricMap,
  providerMetricCapabilities,
  providerSupportsPostAnalytics,
} from "@/lib/metric-registry"

describe("metric registry", () => {
  it("normalizes provider aliases and derives a comparable engagement rate", () => {
    expect(
      normalizeMetricMap(
        { impressions: "1000", likes: "50", comments: "10", bookmarks: 5 },
        "tiktok"
      ).metrics
    ).toMatchObject({
      views: 1000,
      impressions: 1000,
      likes: 50,
      comments: 10,
      saves: 5,
      interactions: 65,
      engagementRate: 6.5,
    })
  })

  it("learns observed metrics without claiming unsupported PostFast coverage", () => {
    expect(providerMetricCapabilities("x", ["reposts"])).toContain("shares")
    expect(providerSupportsPostAnalytics("threads")).toBe(false)
    expect(providerSupportsPostAnalytics("tiktok")).toBe(true)
  })
})
