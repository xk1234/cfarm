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
  it("anchors slide actions inside the fitted media frame", () => {
    const html = renderToStaticMarkup(
      <InteractiveSlideStage
        slide={slide}
        alt={slide.text}
        label="Slide 1 of 3"
        slideNumber={1}
        canDelete
        canReplace
        onDelete={() => undefined}
        onReplace={() => undefined}
      />
    )

    const frameIndex = html.indexOf("data-slide-media-frame")
    const actionsIndex = html.indexOf("data-slide-media-actions")
    const imageIndex = html.indexOf('<img src="/slide.png"')

    expect(frameIndex).toBeGreaterThan(-1)
    expect(imageIndex).toBeGreaterThan(frameIndex)
    expect(actionsIndex).toBeGreaterThan(imageIndex)
    expect(html).toContain("group relative isolate size-full overflow-hidden")
    expect(html).toContain("transform:translate3d(0px, 0px, 0) scale(1)")
    expect(html).toContain(
      '<img src="/slide.png" alt="A portrait slideshow frame" class="absolute inset-0 block size-full object-cover"'
    )
    expect(html).toContain("absolute top-2 right-2")
    expect(html).toContain('aria-label="Edit picture for slide 1"')
    expect(html).toContain('aria-label="Delete slide 1"')
  })
})
