import { beforeEach, describe, expect, it, vi } from "vitest"

import { latestPublicationsByPost } from "@/components/realfarm/analytics/analytics-selectors"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type { PostFastPostRecord } from "@/lib/postfast-posts"

const mocks = vi.hoisted(() => ({
  listAnalyticsIntegrations: vi.fn(),
  listMetricSnapshots: vi.fn(),
  listFollowerSnapshots: vi.fn(),
  listPostFastPostRecords: vi.fn(),
}))

vi.mock("@/lib/postfast-analytics", () => ({
  listAnalyticsIntegrations: mocks.listAnalyticsIntegrations,
  syncPostFastAnalytics: vi.fn(),
}))

vi.mock("@/lib/postfast-metric-snapshots", () => ({
  listMetricSnapshots: mocks.listMetricSnapshots,
  listFollowerSnapshots: mocks.listFollowerSnapshots,
}))

vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))

import { GET } from "./route"

describe("analytics report", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listFollowerSnapshots.mockResolvedValue([])
  })

  it("resolves imported metrics for a manually linked publication", async () => {
    const capturedAt = new Date().toISOString()
    const publication: PostFastPostRecord = {
      id: "publication-manual-1",
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      integrationId: "manual-tiktok",
      provider: "tiktok",
      status: "published",
      publishedAt: capturedAt,
      releaseUrl: "https://www.tiktok.com/@creator/photo/123456789",
      linkState: "manually_linked",
      statsSources: ["tiktok_studio"],
      externalPostId: "123456789",
      content: "A hand-linked slideshow",
      media: [],
      createdAt: capturedAt,
      updatedAt: capturedAt,
    }
    const snapshot: PostFastMetricSnapshot = {
      id: "snapshot-studio-1",
      postId: publication.id,
      platformPostId: publication.externalPostId,
      integrationId: publication.integrationId,
      provider: "tiktok",
      capturedAt,
      publishedAt: capturedAt,
      content: publication.content,
      sourceType: publication.sourceType,
      sourceId: publication.sourceId,
      contentType: "slideshow",
      mediaCount: 3,
      metrics: { views: 321, engagementRate: 12.5 },
      latestMetric: {},
      rawMetrics: {},
      observedKeys: ["views", "engagementRate"],
      source: "tiktok_studio",
    }
    mocks.listAnalyticsIntegrations.mockResolvedValue([
      {
        integration_id: "connected-tiktok",
        provider: "tiktok",
        name: "Connected TikTok",
      },
    ])
    mocks.listMetricSnapshots.mockResolvedValue([snapshot])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])

    const response = await GET(
      new Request("http://localhost/api/analytics/report?days=30")
    )
    const payload = await response.json()
    const posts = latestPublicationsByPost(
      payload.publications,
      payload.snapshots
    )

    expect(posts).toEqual([
      expect.objectContaining({
        postId: publication.id,
        source: "tiktok_studio",
        metrics: expect.objectContaining({
          views: 321,
          engagementRate: 12.5,
        }),
        publication: expect.objectContaining({
          linkState: "manually_linked",
        }),
      }),
    ])
  })
})
