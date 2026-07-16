import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  appendJsonArrayRecords: vi.fn(),
  readJsonArrayStore: vi.fn(),
  withJsonArrayStore: vi.fn(),
}))

vi.mock("@/lib/json-store", () => mocks)

import { appendMetricSnapshots } from "@/lib/postfast-metric-snapshots"

describe("appendMetricSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appendJsonArrayRecords.mockResolvedValue(undefined)
  })

  it("uses the post and capture time as an idempotent append key", async () => {
    const snapshot = {
      postId: "native-post-1",
      platformPostId: "native-post-1",
      integrationId: "integration-1",
      provider: "tiktok",
      capturedAt: "2026-07-15T02:00:00.000Z",
      metrics: { views: 100 },
      latestMetric: { videoViews: 100, extras: { bookmarks: 4 } },
      rawMetrics: { videoViews: 100, bookmarks: 4 },
      observedKeys: ["videoViews", "bookmarks"],
    }

    const first = await appendMetricSnapshots([snapshot])
    const second = await appendMetricSnapshots([snapshot])

    expect(first[0].id).toBe(second[0].id)
    expect(first[0].id).toMatch(/^s[a-f0-9]{35}$/)
    expect(mocks.appendJsonArrayRecords).toHaveBeenCalledTimes(2)
    expect(mocks.appendJsonArrayRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fileName: "postfast-metric-snapshots.json",
        records: [expect.objectContaining({ id: first[0].id })],
      })
    )
    expect(mocks.withJsonArrayStore).not.toHaveBeenCalled()
  })
})
