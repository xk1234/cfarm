import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createBatch: vi.fn(),
  createDevice: vi.fn(),
  createDiscoveredBatch: vi.fn(),
  createImport: vi.fn(),
  createSeedBatch: vi.fn(),
  getCurrentUser: vi.fn(),
  listIntegrations: vi.fn(),
  withOwner: vi.fn(
    async (_ownerId: string, task: () => unknown) => await task()
  ),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))
vi.mock("@/lib/system-owner-context", () => ({
  withSystemOwner: mocks.withOwner,
}))
vi.mock("@/lib/postfast-analytics", () => ({
  listAnalyticsIntegrations: mocks.listIntegrations,
}))
vi.mock("@/lib/tiktok-studio-analytics", () => ({
  createTikTokStudioAnalyticsImport: mocks.createImport,
  createTikTokStudioAnalyticsBatch: mocks.createBatch,
  createTikTokStudioAnalyticsDiscoveredBatch: mocks.createDiscoveredBatch,
  createTikTokStudioAnalyticsSeedBatch: mocks.createSeedBatch,
  createTikTokStudioDeviceAuthorization: mocks.createDevice,
  inspectTikTokStudioAnalyticsBatch: vi.fn(),
  inspectTikTokStudioAnalyticsImport: vi.fn(),
}))

import { POST } from "./route"

describe("TikTok Studio analytics route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue({ $id: "owner-1" })
    mocks.listIntegrations.mockResolvedValue([
      {
        integration_id: "tiktok-account-1",
        provider: "tiktok",
        name: "Creator",
      },
    ])
    mocks.createSeedBatch.mockResolvedValue({
      batch: { id: "batch-1", items: [], counts: {} },
    })
    mocks.createDiscoveredBatch.mockResolvedValue({
      batch: { id: "batch-discovered", items: [], counts: {} },
    })
    mocks.createDevice.mockReturnValue({
      captureToken: "capture-token",
      expiresAt: "2027-07-30T00:00:00.000Z",
    })
  })

  it("adapts an account-scoped URL/ID seed request into a batch", async () => {
    const response = await POST(
      new Request("https://example.com/api/tiktok-studio-analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start_seed_batch",
          integrationId: "tiktok-account-1",
          postReferences:
            "https://www.tiktok.com/@creator/video/7662360324313517330",
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.withOwner).toHaveBeenCalledWith(
      "owner-1",
      expect.any(Function)
    )
    expect(mocks.createSeedBatch).toHaveBeenCalledWith({
      ownerId: "owner-1",
      integrationId: "tiktok-account-1",
      postReferences:
        "https://www.tiktok.com/@creator/video/7662360324313517330",
    })
    await expect(response.json()).resolves.toMatchObject({
      batch: { id: "batch-1" },
      companion: {
        version: 3,
        endpoint: "https://example.com/api/tiktok-studio-analytics/capture",
        token: "capture-token",
      },
    })
  })

  it("imports companion-discovered posts under the connected TikTok account", async () => {
    const posts = [
      {
        externalPostId: "7662360324313517330",
        releaseUrl: "https://www.tiktok.com/@creator/video/7662360324313517330",
        content: "Studio caption",
        publishedAt: "2026-07-30T00:00:00.000Z",
      },
    ]
    const response = await POST(
      new Request("https://example.com/api/tiktok-studio-analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start_discovered_batch",
          integrationId: "tiktok-account-1",
          posts,
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.createDiscoveredBatch).toHaveBeenCalledWith({
      ownerId: "owner-1",
      integrationId: "tiktok-account-1",
      posts,
    })
    await expect(response.json()).resolves.toMatchObject({
      batch: { id: "batch-discovered" },
      companion: {
        version: 3,
        endpoint: "https://example.com/api/tiktok-studio-analytics/capture",
        token: "capture-token",
      },
    })
  })
})
