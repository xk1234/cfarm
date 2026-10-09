import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  SlideshowPublishActions,
  type PublishableSlideshow,
} from "./slideshow-publish-dialog"

const slideshow: PublishableSlideshow = {
  id: "slideshow-1",
  title: "Product slideshow",
  caption: "Caption",
  hashtags: "#product",
  output_images: ["https://example.com/slide-1.png"],
}

function renderActionLabels(initialReleaseUrl?: string) {
  return renderToStaticMarkup(
    <SlideshowPublishActions
      slideshow={slideshow}
      initialReleaseUrl={initialReleaseUrl}
    >
      {(actions) => (
        <ul>
          {actions.map((action) => (
            <li key={action.label}>{action.label}</li>
          ))}
        </ul>
      )}
    </SlideshowPublishActions>
  )
}

describe("SlideshowPublishActions", () => {
  it("provides publication actions as menu-ready items", () => {
    const html = renderActionLabels("https://www.tiktok.com/@account/video/1")

    expect(html).toContain("Open live post")
    expect(html).not.toContain("Link published post")
    expect(html).toContain("Post to social")
  })

  it("omits the live-post action until a release URL is known", () => {
    const html = renderActionLabels()

    expect(html).not.toContain("Open live post")
    expect(html).toContain("Post to social")
  })
})
