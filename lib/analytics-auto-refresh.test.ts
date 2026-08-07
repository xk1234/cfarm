import { describe, expect, it } from "vitest"

import {
  ANALYTICS_AUTO_REFRESH_INTERVAL_MS,
  analyticsNeedsRefresh,
  analyticsRefreshKey,
} from "@/lib/analytics-auto-refresh"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"

const now = Date.parse("2026-08-07T12:00:00.000Z")

describe("automatic analytics refresh", () => {
  it("refreshes when no PostFast capture exists", () => {
    expect(
      analyticsNeedsRefresh(
        {
          snapshots: [snapshot("2026-08-07T11:59:00.000Z", "tiktok_studio")],
        },
        now
      )
    ).toBe(true)
  })

  it("keeps a recent PostFast capture without another request", () => {
    expect(
      analyticsNeedsRefresh(
        { snapshots: [snapshot("2026-08-07T11:50:00.000Z", "postfast")] },
        now
      )
    ).toBe(false)
  })

  it("refreshes after the freshness window", () => {
    expect(
      analyticsNeedsRefresh(
        {
          snapshots: [
            snapshot(
              new Date(now - ANALYTICS_AUTO_REFRESH_INTERVAL_MS).toISOString(),
              "postfast"
            ),
          ],
        },
        now
      )
    ).toBe(true)
  })

  it("refreshes when any connected account has no provider capture", () => {
    expect(
      analyticsNeedsRefresh(
        {
          integrationIds: ["integration-1", "integration-2"],
          snapshots: [snapshot("2026-08-07T11:59:00.000Z", "postfast")],
        },
        now
      )
    ).toBe(true)
  })

  it("uses a stable key for the same account selection", () => {
    const input = {
      integrationIds: ["b", "a"],
      days: 30,
      snapshots: [snapshot("2026-08-07T11:50:00.000Z", "postfast")],
    }
    expect(analyticsRefreshKey(input)).toBe(
      analyticsRefreshKey({ ...input, integrationIds: ["a", "b"] })
    )
  })
})

function snapshot(
  capturedAt: string,
  source: PostFastMetricSnapshot["source"]
): PostFastMetricSnapshot {
  return {
    id: `${source}-${capturedAt}`,
    postId: "post-1",
    integrationId: "integration-1",
    provider: "tiktok",
    capturedAt,
    metrics: {},
    latestMetric: {},
    rawMetrics: {},
    observedKeys: [],
    source,
  }
}
