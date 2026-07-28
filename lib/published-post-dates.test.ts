import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRuns: vi.fn(),
  listGeneratedVideoExports: vi.fn(),
  listPostFastPostRecords: vi.fn(),
}))

vi.mock("@/lib/automation-runner", () => ({
  listAutomationRuns: mocks.listAutomationRuns,
}))
vi.mock("@/lib/generated-videos", () => ({
  listGeneratedVideoExports: mocks.listGeneratedVideoExports,
}))
vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))

import { loadPublishedPostDates } from "@/lib/published-post-dates"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listGeneratedVideoExports.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
})

describe("loadPublishedPostDates", () => {
  it("includes linked publication dates", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication({
        publishedAt: "2026-07-01T12:00:00.000Z",
      }),
      publication({
        id: "unlinked-publication",
        linkState: "unlinked",
        publishedAt: "2026-07-02T12:00:00.000Z",
      }),
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-01T12:00:00.000Z",
    ])
  })

  it("includes manual publish timestamps for runs and generated videos", async () => {
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        slideshowId: "slideshow-1",
        createdAt: "2026-06-01T09:00:00.000Z",
        manuallyPublishedAt: "2026-07-03T12:00:00.000Z",
      },
    ])
    mocks.listGeneratedVideoExports.mockResolvedValue([
      {
        id: "video-1",
        type: "template_video",
        createdAt: "2026-06-02T09:00:00.000Z",
        manuallyPublishedAt: "2026-07-04T12:00:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-03T12:00:00.000Z",
      "2026-07-04T12:00:00.000Z",
    ])
  })

  it("does not count a manually stamped run again when it has a publication", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication({
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        publishedAt: "2026-07-05T12:00:00.000Z",
      }),
    ])
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        slideshowId: "slideshow-1",
        manuallyPublishedAt: "2026-07-05T12:01:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-05T12:00:00.000Z",
    ])
  })

  // The publish path rewrites template_video to generated_video
  // (generated-video-exports.tsx), so the dedupe has to undo that rename.
  it("does not count a manually stamped video again when it has a publication", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication({
        sourceType: "generated_video",
        sourceId: "video-1",
        publishedAt: "2026-07-05T12:00:00.000Z",
      }),
    ])
    mocks.listGeneratedVideoExports.mockResolvedValue([
      {
        id: "video-1",
        type: "template_video",
        manuallyPublishedAt: "2026-07-05T12:01:00.000Z",
      },
      {
        id: "video-2",
        type: "greenscreen",
        manuallyPublishedAt: "2026-07-07T12:00:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-05T12:00:00.000Z",
      "2026-07-07T12:00:00.000Z",
    ])
  })

  it("keeps dates from healthy sources when another source fails", async () => {
    mocks.listPostFastPostRecords.mockRejectedValue(new Error("unavailable"))
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        manuallyPublishedAt: "2026-07-06T12:00:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-06T12:00:00.000Z",
    ])
  })
})

function publication(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "publication-1",
    sourceType: "automation",
    sourceId: "run-1",
    linkState: "postfast_published",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  }
}
