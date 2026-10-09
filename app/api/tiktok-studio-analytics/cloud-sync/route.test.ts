import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  ensurePost: vi.fn(),
  metricSnapshotId: vi.fn(),
  ownerId: vi.fn(),
  upsertSnapshot: vi.fn(),
  withOwner: vi.fn(
    async (_ownerId: string, task: () => unknown) => await task()
  ),
}))

vi.mock("@/lib/postfast-metric-snapshots", () => ({
  metricSnapshotId: mocks.metricSnapshotId,
  upsertMetricSnapshot: mocks.upsertSnapshot,
}))
vi.mock("@/lib/post-repository", () => ({
  ensurePostForSnapshot: mocks.ensurePost,
}))
vi.mock("@/lib/system-owner-context", () => ({
  withSystemOwner: mocks.withOwner,
}))
vi.mock("@/lib/tiktok-studio-cloud-sync", () => ({
  authorizeTikTokStudioCloudSync: mocks.authorize,
  tiktokStudioCloudOwnerId: mocks.ownerId,
}))

import { POST } from "./route"

describe("TikTok Studio cloud snapshot sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockReturnValue(true)
    mocks.ensurePost.mockResolvedValue({ id: "publication-1" })
    mocks.metricSnapshotId.mockReturnValue("canonical-snapshot-id")
    mocks.ownerId.mockReturnValue("owner-1")
    mocks.upsertSnapshot.mockImplementation(async (snapshot) => snapshot)
  })

  it("ensures the post before storing the Studio snapshot", async () => {
    const releaseUrl =
      "https://www.tiktok.com/@horoiq/photo/7662360324313517330"
    const response = await POST(
      new Request(
        "https://cfarm-eight.vercel.app/api/tiktok-studio-analytics/cloud-sync",
        {
          method: "POST",
          headers: {
            authorization: "Bearer signed-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            snapshot: {
              id: "snapshot-1",
              postId: "publication-1",
              platformPostId: "7662360324313517330",
              integrationId: "tiktok-1",
              provider: "tiktok",
              capturedAt: "2026-07-23T05:42:05.742Z",
              releaseUrl,
              metrics: { views: 100 },
              latestMetric: { views: 100 },
              rawMetrics: { views: 100 },
              observedKeys: ["views"],
              source: "tiktok_studio",
              tiktokStudio: {
                schemaVersion: 1,
                studioUrl:
                  "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
                capturedSections: ["overview"],
                slides: [],
                trafficSources: {},
                searchTerms: [],
              },
            },
          }),
        }
      )
    )

    expect(response.status).toBe(200)
    expect(mocks.ensurePost).toHaveBeenCalledWith(
      expect.objectContaining({ releaseUrl })
    )
    expect(mocks.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: "publication-1",
        releaseUrl,
      })
    )
    expect(mocks.ensurePost.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsertSnapshot.mock.invocationCallOrder[0]
    )
    await expect(response.json()).resolves.toMatchObject({
      synced: true,
      snapshotId: "snapshot-1",
      publicationUpdated: true,
    })
  })
})
