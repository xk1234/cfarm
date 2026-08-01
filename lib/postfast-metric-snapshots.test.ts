import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addPostStatsSources: vi.fn(),
  appendJsonArrayRecords: vi.fn(),
  readJsonArrayStore: vi.fn(),
  upsertJsonArrayRecord: vi.fn(),
  withJsonArrayStore: vi.fn(),
}))

vi.mock("@/lib/json-store", () => ({
  appendJsonArrayRecords: mocks.appendJsonArrayRecords,
  readJsonArrayStore: mocks.readJsonArrayStore,
  upsertJsonArrayRecord: mocks.upsertJsonArrayRecord,
  withJsonArrayStore: mocks.withJsonArrayStore,
}))

vi.mock("@/lib/post-repository", () => ({
  addPostStatsSources: mocks.addPostStatsSources,
}))

import {
  appendMetricSnapshots,
  upsertMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"

describe("appendMetricSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appendJsonArrayRecords.mockResolvedValue(undefined)
    mocks.addPostStatsSources.mockResolvedValue(1)
    mocks.upsertJsonArrayRecord.mockResolvedValue(undefined)
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

  it("routes snapshot stats-source updates through the post repository", async () => {
    await upsertMetricSnapshot({
      id: "snapshot-studio-1",
      postId: "post-1",
      platformPostId: "native-1",
      integrationId: "integration-1",
      provider: "tiktok",
      capturedAt: "2026-07-30T02:00:00.000Z",
      metrics: { views: 100 },
      latestMetric: { views: 100 },
      rawMetrics: { views: 100 },
      observedKeys: ["views"],
      source: "tiktok_studio",
    })

    expect(mocks.addPostStatsSources).toHaveBeenCalledOnce()
    const sourcesByPostId = mocks.addPostStatsSources.mock.calls[0][0]
    expect(sourcesByPostId.get("post-1")).toEqual(["tiktok_studio"])
  })
})
