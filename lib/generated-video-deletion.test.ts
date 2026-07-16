import { describe, expect, it } from "vitest"

import { generatedVideoDeletionBlockReason } from "@/lib/generated-video-deletion"

describe("generatedVideoDeletionBlockReason", () => {
  it("allows unpublished generated videos to be deleted", () => {
    expect(
      generatedVideoDeletionBlockReason("video-1", [
        { sourceId: "video-1", status: "draft" },
      ])
    ).toBeNull()
  })

  it("blocks scheduled and published generated videos", () => {
    expect(
      generatedVideoDeletionBlockReason("video-1", [
        { sourceId: "video-1", status: "scheduled" },
      ])
    ).toBe("scheduled")
    expect(
      generatedVideoDeletionBlockReason("video-1", [
        { sourceId: "video-1:instagram", status: "published" },
      ])
    ).toBe("published")
  })

  it("ignores posts belonging to other outputs", () => {
    expect(
      generatedVideoDeletionBlockReason("video-1", [
        { sourceId: "video-10", status: "published" },
      ])
    ).toBeNull()
  })
})
