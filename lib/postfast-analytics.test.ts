import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  appendFollowerSnapshots: vi.fn(),
  appendMetricSnapshots: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  postfastRequest: vi.fn(),
}))

vi.mock("@/lib/postfast-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/postfast-client")>()
  return { ...actual, postfastRequest: mocks.postfastRequest }
})

vi.mock("@/lib/postfast-metric-snapshots", () => ({
  appendFollowerSnapshots: mocks.appendFollowerSnapshots,
  appendMetricSnapshots: mocks.appendMetricSnapshots,
}))

vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))

import { syncPostFastAnalytics } from "@/lib/postfast-analytics"

describe("syncPostFastAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appendMetricSnapshots.mockImplementation(async (snapshots) =>
      snapshots.map((snapshot: object, index: number) => ({
        ...snapshot,
        id: `snapshot-${index + 1}`,
      }))
    )
    mocks.appendFollowerSnapshots.mockResolvedValue([])
    mocks.listPostFastPostRecords.mockResolvedValue([
      {
        id: "local-post-1",
        sourceType: "automation",
        sourceId: "run-1",
        postfastPostId: "postfast-post-1",
        integrationId: "integration-1",
        provider: "tiktok",
        status: "published",
        content: "Local caption",
        media: [],
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
    ])
    mocks.postfastRequest.mockImplementation(async (path: string) => {
      if (path === "/social-posts/analytics") {
        return {
          data: [
            {
              id: "postfast-post-1",
              platformPostId: "native-post-1",
              content: "Remote caption",
              latestMetric: {
                videoViews: 120,
                likes: 14,
                extras: { bookmarks: 6 },
                audience: { country: "SG" },
              },
            },
            {
              id: "postfast-post-2",
              platformPostId: "native-post-2",
              content: "External post",
              latestMetric: { videoViews: 45, comments: 3 },
            },
          ],
        }
      }
      throw new Error("Follower history unavailable")
    })
  })

  it("appends full metrics for local and unmatched platform posts", async () => {
    const capturedAt = new Date("2026-07-15T02:00:00.000Z")
    const result = await syncPostFastAnalytics({
      capturedAt,
      days: 30,
      integrations: [
        {
          integration_id: "integration-1",
          provider: "tiktok",
          name: "Brand TikTok",
        },
      ],
    })

    expect(result.metricSnapshots).toBe(2)
    expect(mocks.appendMetricSnapshots).toHaveBeenCalledOnce()
    const snapshots = mocks.appendMetricSnapshots.mock.calls[0][0]
    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toMatchObject({
      postId: "local-post-1",
      platformPostId: "native-post-1",
      capturedAt: capturedAt.toISOString(),
      sourceType: "automation",
      sourceId: "run-1",
      metrics: { views: 120, likes: 14, saves: 6 },
      rawMetrics: { videoViews: 120, likes: 14, bookmarks: 6 },
      latestMetric: {
        videoViews: 120,
        likes: 14,
        extras: { bookmarks: 6 },
        audience: { country: "SG" },
      },
    })
    expect(snapshots[1]).toMatchObject({
      postId: "native-post-2",
      platformPostId: "native-post-2",
      sourceType: "external",
      latestMetric: { videoViews: 45, comments: 3 },
    })
  })
})
