import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  InteractiveSlideStage,
  type SlideshowViewerSlide,
} from "./slideshow-viewer-modal"

const slide: SlideshowViewerSlide = {
  id: "slide-1",
  imageUrl: "/slide.png",
  text: "A portrait slideshow frame",
  section: "hook",
}

describe("InteractiveSlideStage", () => {
  it("renders the slide inside the fitted, zoomable media frame", () => {
    const html = renderToStaticMarkup(
      <InteractiveSlideStage
        slide={slide}
        alt={slide.text}
        label="Slide 1 of 3"
      />
    )

    const frameIndex = html.indexOf("data-slide-media-frame")
    const imageIndex = html.indexOf('<img src="/slide.png"')

    expect(frameIndex).toBeGreaterThan(-1)
    expect(imageIndex).toBeGreaterThan(frameIndex)
    expect(html).toContain("group relative isolate size-full overflow-hidden")
    expect(html).toContain("transform:translate3d(0px, 0px, 0) scale(1)")
    expect(html).toContain(
      '<img src="/slide.png" alt="A portrait slideshow frame" class="absolute inset-0 block size-full object-cover"'
    )
    expect(html).not.toContain("data-slide-media-actions")
    expect(html).not.toContain("Edit picture for slide")
  })
})
