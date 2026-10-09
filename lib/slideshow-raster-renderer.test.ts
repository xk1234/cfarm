import { describe, expect, it } from "vitest"

import { renderSlideshowSlideBuffers } from "@/lib/slideshow-raster-renderer"

const wideRedImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVR4nGO4I6fxHxkzoAsAAB/tEQmsOaEnAAAAAElFTkSuQmCC"

describe("Fabric slideshow raster renderer", () => {
  it("exports a full-frame Fabric canvas as a 9:16 PNG", async () => {
    const rendered = await renderSlideshowSlideBuffers({
      slide: {
        id: "fabric-cover",
        image_url: wideRedImage,
        imageFit: "contain",
        textItems: [],
      },
      sourceUrl: wideRedImage,
      aspectRatio: "9:16",
    })
    const sharp = (await import("sharp")).default
    const metadata = await sharp(rendered.png).metadata()
    const corner = await sharp(rendered.png)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer()

    expect(metadata.width).toBe(1080)
    expect(metadata.height).toBe(1920)
    expect(rendered.svg).toContain("Created with Fabric.js 7.4.0")
    expect(corner[0]).toBeGreaterThan(200)
    expect(corner[1]).toBeLessThan(50)
    expect(corner[2]).toBeLessThan(50)
  })
})
