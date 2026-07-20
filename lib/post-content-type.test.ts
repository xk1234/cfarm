import { describe, expect, it } from "vitest"

import { inferPostContentType } from "@/lib/post-content-type"

describe("post content type", () => {
  it("recognizes slideshow automation and multi-image posts", () => {
    expect(inferPostContentType({ sourceType: "automation" })).toBe("slideshow")
    expect(
      inferPostContentType({
        sourceType: "external",
        media: [{ type: "IMAGE" }, { type: "IMAGE" }],
      })
    ).toBe("slideshow")
  })

  it("prioritizes video media over a generic source type", () => {
    expect(
      inferPostContentType({
        sourceType: "external",
        media: [{ type: "VIDEO" }],
      })
    ).toBe("video")
    expect(inferPostContentType({ sourceType: "generated_video" })).toBe(
      "video"
    )
    expect(
      inferPostContentType({
        sourceType: "external",
        metrics: { avgWatchTimeSeconds: 7.2 },
      })
    ).toBe("video")
  })

  it("keeps single-image, text, and unmatched external posts distinct", () => {
    expect(inferPostContentType({ media: [{ type: "IMAGE" }] })).toBe("image")
    expect(inferPostContentType({ sourceType: "x_automation" })).toBe("text")
    expect(inferPostContentType({ sourceType: "external" })).toBe("external")
  })
})
