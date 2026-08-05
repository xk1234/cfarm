import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ upsertGeneratedPostIntents: vi.fn() }))

vi.mock("@/lib/post-writer", () => ({
  upsertGeneratedPostIntents: mocks.upsertGeneratedPostIntents,
}))

import {
  defaultSlideshowSettings,
  recordSlideshowPostIntents,
  type SlideshowRecord,
} from "@/lib/slideshows"

beforeEach(() => {
  mocks.upsertGeneratedPostIntents.mockReset()
  mocks.upsertGeneratedPostIntents.mockResolvedValue([])
})

describe("slideshow intent materialization", () => {
  it("records ready per-destination intents for a successful automation output", async () => {
    const slideshow: SlideshowRecord = {
      id: "slideshow-1",
      automationId: "automation-1",
      runId: "run-1",
      title: "Title",
      caption: "Caption",
      hashtags: "#tag",
      prompt: "Prompt",
      image_collection: "images",
      slideshow_type: "automation",
      created_at: "2026-07-30T12:00:00.000Z",
      updated_at: "2026-07-30T12:01:00.000Z",
      settings: defaultSlideshowSettings(),
      images: [],
      status: "exported",
      output_images: ["https://cdn.example/slide-1.png"],
    }
    await recordSlideshowPostIntents(
      slideshow,
      { runId: "run-1" },
      {
        publishMode: "review",
        postIntentDestinations: [
          { integrationId: "account-1", provider: "tiktok" },
          { integrationId: "account-2", provider: "instagram" },
        ],
      }
    )

    expect(mocks.upsertGeneratedPostIntents).toHaveBeenCalledWith({
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      outputId: "slideshow-1",
      automationId: "automation-1",
      runId: "run-1",
      sourceEntityId: "slideshow-1",
      publishMode: "review",
      destinations: [
        { integrationId: "account-1", provider: "tiktok" },
        { integrationId: "account-2", provider: "instagram" },
      ],
      content: "Caption\n\n#tag",
      media: [{ kind: "image", url: "https://cdn.example/slide-1.png" }],
      generatedAt: "2026-07-30T12:01:00.000Z",
    })
  })

  it("does not create an intent for a failed slideshow", async () => {
    await recordSlideshowPostIntents(
      {
        id: "slideshow-failed",
        title: "Failed",
        caption: "",
        hashtags: "",
        prompt: "",
        image_collection: "",
        slideshow_type: "automation",
        created_at: "2026-07-30T12:00:00.000Z",
        updated_at: "2026-07-30T12:01:00.000Z",
        settings: defaultSlideshowSettings(),
        images: [],
        status: "failed",
        output_images: [],
      },
      { runId: "run-failed" },
      {}
    )

    expect(mocks.upsertGeneratedPostIntents).not.toHaveBeenCalled()
  })
})
