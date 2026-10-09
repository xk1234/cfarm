import { afterEach, describe, expect, it, vi } from "vitest"

import {
  authorizeTikTokStudioCloudSync,
  syncTikTokStudioSnapshotToCloud,
} from "@/lib/tiktok-studio-cloud-sync"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"

const previousOrigin = process.env.TIKTOK_STUDIO_CLOUD_ORIGIN
const previousSecret = process.env.TIKTOK_STUDIO_CAPTURE_SECRET

afterEach(() => {
  process.env.TIKTOK_STUDIO_CLOUD_ORIGIN = previousOrigin
  process.env.TIKTOK_STUDIO_CAPTURE_SECRET = previousSecret
})

describe("TikTok Studio cloud sync", () => {
  it("does not mirror a capture already received by the cloud deployment", async () => {
    process.env.TIKTOK_STUDIO_CLOUD_ORIGIN =
      "https://cfarm-eight.vercel.app"
    process.env.TIKTOK_STUDIO_CAPTURE_SECRET = "cloud-secret"
    const fetchImpl = vi.fn()

    const result = await syncTikTokStudioSnapshotToCloud({
      snapshot: snapshot(),
      requestUrl:
        "https://cfarm-eight.vercel.app/api/tiktok-studio-analytics/capture",
      fetchImpl,
    })

    expect(result).toEqual({ synced: false, reason: "already-cloud" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("mirrors local captures to the protected cloud endpoint", async () => {
    process.env.TIKTOK_STUDIO_CLOUD_ORIGIN =
      "https://cfarm-eight.vercel.app"
    process.env.TIKTOK_STUDIO_CAPTURE_SECRET = "cloud-secret"
    const fetchImpl = vi.fn(async () =>
      Response.json({ synced: true, snapshotId: "snapshot-1" })
    )

    const result = await syncTikTokStudioSnapshotToCloud({
      snapshot: snapshot(),
      requestUrl:
        "http://localhost:3000/api/tiktok-studio-analytics/capture",
      fetchImpl,
    })

    expect(result).toEqual({ synced: true, snapshotId: "snapshot-1" })
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "https://cfarm-eight.vercel.app/api/tiktok-studio-analytics/cloud-sync"
      ),
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer cloud-secret",
          "content-type": "application/json",
        },
      })
    )
  })

  it("uses a timing-safe bearer check for the cloud endpoint", () => {
    process.env.TIKTOK_STUDIO_CAPTURE_SECRET = "cloud-secret"

    expect(authorizeTikTokStudioCloudSync("Bearer cloud-secret")).toBe(true)
    expect(authorizeTikTokStudioCloudSync("Bearer wrong-secret")).toBe(false)
    expect(authorizeTikTokStudioCloudSync(null)).toBe(false)
  })
})

function snapshot(): PostFastMetricSnapshot {
  return {
    id: "snapshot-1",
    postId: "publication-1",
    platformPostId: "7662360324313517330",
    integrationId: "tiktok-1",
    provider: "tiktok",
    capturedAt: "2026-07-23T05:42:05.742Z",
    metrics: { views: 100 },
    latestMetric: { views: 100 },
    rawMetrics: { views: 100 },
    observedKeys: ["views"],
    source: "tiktok_studio" as const,
    tiktokStudio: {
      schemaVersion: 1 as const,
      studioUrl:
        "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
      capturedSections: ["overview"],
      slides: [],
      trafficSources: {},
      searchTerms: [],
    },
  }
}
