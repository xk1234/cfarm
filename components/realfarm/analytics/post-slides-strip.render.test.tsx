import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PostSlidesStrip } from "@/components/realfarm/analytics/post-slides-strip"

describe("PostSlidesStrip rendering", () => {
  it("renders every persisted slideshow image in order", () => {
    const html = renderToStaticMarkup(
      <PostSlidesStrip
        slides={[
          { index: 1, imageUrl: "/assets/rendered-slide-1.png" },
          { index: 2, imageUrl: "/assets/rendered-slide-2.png" },
          { index: 3, imageUrl: "/assets/rendered-slide-3.png" },
        ]}
      />
    )

    expect(html).toContain("Published slides")
    expect(html).toContain("Rendered slide 1")
    expect(html).toContain("Rendered slide 2")
    expect(html).toContain("Rendered slide 3")
    expect(html).toContain("/assets/rendered-slide-1.png")
    expect(html).toContain("/assets/rendered-slide-2.png")
    expect(html).toContain("/assets/rendered-slide-3.png")
  })

  it("omits the strip when no rendered slides exist", () => {
    expect(renderToStaticMarkup(<PostSlidesStrip slides={[]} />)).toBe("")
  })
})
