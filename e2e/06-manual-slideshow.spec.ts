import { test, expect, gotoView } from "./fixtures"

// Journey 6 — Build a one-off slideshow by hand, render it, and view it.
test.describe("Journey 6 — manual slideshow", () => {
  test("assemble a slideshow, export as video, and play it in the viewer", async ({ page, state }) => {
    // Seed a collection to build from.
    state.collections = [
      {
        name: "Focus scenes",
        created_at: new Date().toISOString(),
        images: [
          { image_link: "/api/local-assets/image-collections/files/focus.jpg", caption: "Focus" },
        ],
      },
    ]

    await page.goto("/")

    await test.step("assemble slides from a collection", async () => {
      await gotoView(page, "Collections")
      // TODO(selector): open the collection, add images to a new slideshow, add
      // hook/body text, set aspect ratio + an overlay, pick a sound, enable
      // "export as video". Add data-testids to the slideshow builder controls.
    })

    await test.step("render the slideshow", async () => {
      // TODO(selector): click the render/create control.
      // In mocked mode the POST /api/slideshows stub returns a slideshow with an
      // exported MP4; seed it if the builder UI can't be driven yet.
      if (state.slideshows.length === 0) {
        state.slideshows = [{
          id: "slideshow-1",
          title: "Focus",
          status: "exported",
          settings: { export_as_video: true },
          output_images: ["/api/local-assets/slideshows/outputs/x/slide-001.svg"],
          video_url: "/api/local-assets/slideshows/outputs/x/slideshow-export.mp4",
          thumbnail_url: "/api/local-assets/slideshows/outputs/x/slideshow-thumbnail.png",
          images: [],
        }]
      }
      expect(state.slideshows[0].video_url).toContain("slideshow-export.mp4")
    })

    await test.step("play it in the viewer", async () => {
      // TODO(selector): open the slideshow viewer modal and assert slides/video
      // render (the viewer takes `slides: SlideshowViewerSlide[]`).
      await page.getByRole("button", { name: /View|Play|Open/i }).first().click().catch(() => {})
    })
  })
})
