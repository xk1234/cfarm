import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAutomationRunForSlideshow: vi.fn(),
  markAutomationRunPublished: vi.fn(),
  getGeneratedVideoExport: vi.fn(),
  markGeneratedVideoExportPublished: vi.fn(),
}))

vi.mock("@/lib/automation-runner", () => ({
  getAutomationRunForSlideshow: mocks.getAutomationRunForSlideshow,
  markAutomationRunPublished: mocks.markAutomationRunPublished,
}))
vi.mock("@/lib/generated-videos", () => ({
  getGeneratedVideoExport: mocks.getGeneratedVideoExport,
  markGeneratedVideoExportPublished: mocks.markGeneratedVideoExportPublished,
}))
vi.mock("@/lib/system-owner-context", () => ({
  withSystemOwner: (_ownerId: string, task: () => unknown) => task(),
}))

import { markReminderGenerationPosted } from "@/lib/reminder-actions"

describe("markReminderGenerationPosted", () => {
  beforeEach(() => vi.clearAllMocks())

  it("marks a slideshow run without requiring a public post URL", async () => {
    mocks.getAutomationRunForSlideshow.mockResolvedValue({ id: "run-1" })
    mocks.markAutomationRunPublished.mockResolvedValue({
      manuallyPublishedAt: "2026-07-18T05:00:00.000Z",
    })

    await expect(
      markReminderGenerationPosted({
        ownerId: "owner-1",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        publishedAt: new Date("2026-07-18T05:00:00.000Z"),
      })
    ).resolves.toEqual({
      alreadyPosted: false,
      publishedAt: "2026-07-18T05:00:00.000Z",
    })
    expect(mocks.markAutomationRunPublished).toHaveBeenCalledWith({
      slideshowId: "slideshow-1",
      runId: "run-1",
      publishedAt: new Date("2026-07-18T05:00:00.000Z"),
    })
  })

  it("is idempotent when the generation was already marked posted", async () => {
    mocks.getAutomationRunForSlideshow.mockResolvedValue({
      id: "run-1",
      manuallyPublishedAt: "2026-07-18T05:00:00.000Z",
    })

    await expect(
      markReminderGenerationPosted({
        ownerId: "owner-1",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
      })
    ).resolves.toEqual({
      alreadyPosted: true,
      publishedAt: "2026-07-18T05:00:00.000Z",
    })
    expect(mocks.markAutomationRunPublished).not.toHaveBeenCalled()
  })

  it("supports generated videos", async () => {
    mocks.getGeneratedVideoExport.mockResolvedValue({ id: "video-1" })
    mocks.markGeneratedVideoExportPublished.mockResolvedValue({
      manuallyPublishedAt: "2026-07-18T06:00:00.000Z",
    })

    await expect(
      markReminderGenerationPosted({
        ownerId: "owner-1",
        sourceType: "generated_video",
        sourceId: "video-1",
        publishedAt: new Date("2026-07-18T06:00:00.000Z"),
      })
    ).resolves.toMatchObject({ alreadyPosted: false })
  })
})
