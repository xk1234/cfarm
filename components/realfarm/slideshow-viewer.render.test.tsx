import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SlideshowViewer } from "@/components/realfarm/slideshow-viewer-modal"

describe("SlideshowViewer rendering", () => {
  it("renders one active slide with the shared viewer controls", () => {
    const html = renderToStaticMarkup(
      <SlideshowViewer
        title="Published slideshow"
        slides={[
          {
            id: "slide-1",
            imageUrl: "/assets/rendered-slide-1.png",
            text: "Pisces hook",
            section: "hook",
          },
          {
            id: "slide-2",
            imageUrl: "/assets/rendered-slide-2.png",
            text: "Pisces body",
            section: "content",
          },
        ]}
        activeSlide={0}
        onActiveSlideChange={() => undefined}
      />
    )

    expect(html).toContain("data-slideshow-viewer")
    expect(html).toContain("Pisces hook")
    expect(html).toContain("Slide 1 of 2")
    expect(html).toContain('aria-label="Previous slide"')
    expect(html).toContain('aria-label="Next slide"')
    expect(html).not.toContain("/assets/rendered-slide-2.png")
  })
})
