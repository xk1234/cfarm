import { describe, expect, it } from "vitest"

import {
  generatedVideoAssetPath,
  generatedVideoContentType,
  publicGeneratedVideoMediaUrl,
} from "@/lib/public-generated-video-assets"

describe("public generated-video assets", () => {
  it("accepts current and legacy generated asset routes", () => {
    expect(
      generatedVideoAssetPath(
        "/api/local-assets/ugc_avatar_videos/owner-1/run-1/video.mp4"
      )
    ).toBe("ugc_avatar_videos/owner-1/run-1/video.mp4")
    expect(
      generatedVideoAssetPath(
        "https://app.example.com/api/assets/ugc_avatar_videos/owner-1/run-1/thumbnail.jpg"
      )
    ).toBe("ugc_avatar_videos/owner-1/run-1/thumbnail.jpg")
  })

  it("rejects arbitrary and traversing asset paths", () => {
    expect(generatedVideoAssetPath("https://example.com/video.mp4")).toBeNull()
    expect(generatedVideoAssetPath("/private/video.mp4")).toBeNull()
    expect(
      generatedVideoAssetPath(
        "/api/local-assets/ugc_avatar_videos/owner-1/%2e%2e/video.mp4"
      )
    ).toBeNull()
  })

  it("builds encoded media URLs and detects content types", () => {
    expect(
      publicGeneratedVideoMediaUrl({
        outputId: "video / 1",
        token: "signed+token",
        kind: "video",
        download: true,
      })
    ).toBe(
      "/api/public/videos/video%20%2F%201/media?kind=video&token=signed%2Btoken&download=1"
    )
    expect(generatedVideoContentType("output/video.mp4")).toBe("video/mp4")
    expect(generatedVideoContentType("output/video.bin")).toBe(
      "application/octet-stream"
    )
  })
})
