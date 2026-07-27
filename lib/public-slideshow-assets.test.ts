import { describe, expect, it } from "vitest"

import {
  publicSlideshowImageUrl,
  slideshowImageContentType,
  slideshowOutputAssetPath,
} from "@/lib/public-slideshow-assets"

describe("public slideshow assets", () => {
  it("accepts only rendered slideshow output paths", () => {
    expect(
      slideshowOutputAssetPath(
        "/api/local-assets/slideshows/outputs/output-1/slide-001.png"
      )
    ).toBe("slideshows/outputs/output-1/slide-001.png")
    expect(
      slideshowOutputAssetPath(
        "https://app.example.com/api/local-assets/slideshows/outputs/output-1/slide-001.webp"
      )
    ).toBe("slideshows/outputs/output-1/slide-001.webp")
    expect(
      slideshowOutputAssetPath("/api/local-assets/assets/files/private.png")
    ).toBeNull()
    expect(
      slideshowOutputAssetPath(
        "/api/local-assets/slideshows/outputs/%2e%2e/private.png"
      )
    ).toBeNull()
    expect(slideshowOutputAssetPath("https://example.com/image.png")).toBeNull()
  })

  it("creates an output-scoped signed image URL", () => {
    expect(
      publicSlideshowImageUrl({
        outputId: "output / 1",
        token: "signed+token",
        index: 0,
      })
    ).toBe(
      "/api/public/slideshows/output%20%2F%201/slides/1?token=signed%2Btoken"
    )
  })

  it("returns the stored image content type", () => {
    expect(slideshowImageContentType("slideshows/outputs/x/slide.png")).toBe(
      "image/png"
    )
    expect(slideshowImageContentType("slideshows/outputs/x/slide.bin")).toBe(
      "application/octet-stream"
    )
  })
})
