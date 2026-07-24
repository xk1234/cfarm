import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  ownerId: vi.fn(),
  patchPublication: vi.fn(),
  upsertSnapshot: vi.fn(),
  withOwner: vi.fn(
    async (_ownerId: string, task: () => unknown) => await task()
  ),
}))

vi.mock("@/lib/postfast-metric-snapshots", () => ({
  upsertMetricSnapshot: mocks.upsertSnapshot,
}))
vi.mock("@/lib/postfast-posts", () => ({
  patchPostFastPostRecord: mocks.patchPublication,
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
    mocks.ownerId.mockReturnValue("owner-1")
    mocks.upsertSnapshot.mockImplementation(async (snapshot) => snapshot)
    mocks.patchPublication.mockResolvedValue({ id: "publication-1" })
  })

  it("persists the canonical public URL on the cloud publication", async () => {
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
    expect(mocks.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ releaseUrl })
    )
    expect(mocks.patchPublication).toHaveBeenCalledWith({
      id: "publication-1",
      releaseUrl,
    })
    await expect(response.json()).resolves.toMatchObject({
      synced: true,
      snapshotId: "snapshot-1",
      publicationUpdated: true,
    })
  })
})
