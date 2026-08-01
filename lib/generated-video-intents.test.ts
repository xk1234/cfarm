import { beforeEach, describe, expect, it, vi } from "vitest"

import type { GeneratedVideoExport } from "@/lib/generated-video-types"

const state = vi.hoisted(() => ({
  records: [] as GeneratedVideoExport[],
  upsertGeneratedPostIntents: vi.fn(),
  markOutputPostPublished: vi.fn(),
}))

vi.mock("@/lib/json-store", () => ({
  readJsonArrayStore: async () => state.records,
  readJsonArrayRecord: async ({ id }: { id: string }) =>
    state.records.find((record) => record.id === id) ?? null,
  upsertJsonArrayRecord: async ({
    record,
  }: {
    record: GeneratedVideoExport
  }) => {
    state.records = [
      record,
      ...state.records.filter((item) => item.id !== record.id),
    ]
  },
  deleteJsonArrayRecord: vi.fn(),
}))
vi.mock("@/lib/post-writer", () => ({
  upsertGeneratedPostIntents: state.upsertGeneratedPostIntents,
  markOutputPostPublished: state.markOutputPostPublished,
}))

import {
  createGeneratedVideoExport,
  markGeneratedVideoExportPublished,
  updateGeneratedVideoExport,
} from "@/lib/generated-videos"

beforeEach(() => {
  state.records = []
  state.upsertGeneratedPostIntents.mockReset()
  state.upsertGeneratedPostIntents.mockResolvedValue([])
  state.markOutputPostPublished.mockReset()
  state.markOutputPostPublished.mockResolvedValue(null)
})

describe("generated-video intent materialization", () => {
  it("creates an unassigned ready intent when a ready video is created", async () => {
    const video = await createGeneratedVideoExport({
      id: "video-1",
      type: "template_video",
      status: "ready",
      title: "Video title",
      description: "Video caption",
      hashtags: ["#tag"],
      videoUrl: "/api/local-assets/generated-videos/video.mp4",
    })

    expect(state.upsertGeneratedPostIntents).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "generated_video",
        sourceId: "video-1",
        outputId: "video-1",
        content: "Video caption\n\n#tag",
        media: [
          {
            kind: "video",
            url: "/api/local-assets/generated-videos/video.mp4",
          },
        ],
        generatedAt: video.updatedAt,
      })
    )
  })

  it("creates the intent only when an asynchronous export reaches ready", async () => {
    await createGeneratedVideoExport({
      id: "video-queued",
      type: "ugc_ad",
      status: "queued",
      title: "Queued video",
    })
    expect(state.upsertGeneratedPostIntents).not.toHaveBeenCalled()

    await updateGeneratedVideoExport({
      id: "video-queued",
      status: "ready",
      videoUrl: "/api/local-assets/generated-videos/ready.mp4",
    })
    expect(state.upsertGeneratedPostIntents).toHaveBeenCalledTimes(1)
  })

  it("retains the source-only manual stamp while advancing the canonical intent", async () => {
    await createGeneratedVideoExport({
      id: "video-manual",
      type: "template_video",
      status: "queued",
      title: "Manual video",
    })
    const published = await markGeneratedVideoExportPublished({
      id: "video-manual",
      publishedAt: new Date("2026-07-30T12:00:00.000Z"),
    })

    expect(published?.manuallyPublishedAt).toBe("2026-07-30T12:00:00.000Z")
    expect(state.markOutputPostPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "generated_video",
        sourceId: "video-manual",
        outputId: "video-manual",
        publishedAt: "2026-07-30T12:00:00.000Z",
      })
    )
  })
})
