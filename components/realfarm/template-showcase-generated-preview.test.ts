import { describe, expect, it } from "vitest"

import {
  TemplateGeneratedPreview,
  generatedExampleSlideshows,
} from "@/components/realfarm/template-showcase-preview"

describe("template showcase generated previews", () => {
  it("keeps example slideshow runs grouped for the modal selector", () => {
    const slideshows = generatedExampleSlideshows([
      {
        id: "run-1",
        plan: {
          slides: [
            { id: "a", imageUrl: "https://example.com/a.jpg", text: "First" },
            {
              id: "b",
              role: "content",
              imageUrl: "https://example.com/b.jpg",
              text: "Second",
            },
          ],
        },
      },
      {
        id: "run-2",
        plan: {
          slides: [
            {
              id: "c",
              imageUrl: "https://example.com/c.jpg",
              imageCaption: "Third",
            },
          ],
        },
      },
    ])

    expect(slideshows).toMatchObject([
      {
        id: "run-1",
        label: "Slideshow 1",
        title: "Slideshow 1",
        status: "succeeded",
        caption: "First",
        durationSeconds: 8,
        slides: [
          {
            id: "run-1-a",
            imageUrl: "https://example.com/a.jpg",
            text: "First",
            section: "hook",
          },
          {
            id: "run-1-b",
            imageUrl: "https://example.com/b.jpg",
            text: "Second",
            section: "content",
          },
        ],
      },
      {
        id: "run-2",
        label: "Slideshow 2",
        title: "Slideshow 2",
        status: "succeeded",
        caption: "Third",
        durationSeconds: 4,
        slides: [
          {
            id: "run-2-c",
            imageUrl: "https://example.com/c.jpg",
            text: "Third",
            section: "hook",
          },
        ],
      },
    ])
  })

  it("does not paint an extra text overlay on hook slide previews", () => {
    const markup = TemplateGeneratedPreview({
      exampleSlides: [
        {
          id: "hook-slide",
          imageUrl: "https://example.com/hook.jpg",
          text: "hook already in image",
          section: "hook",
        },
        {
          id: "content-slide",
          imageUrl: "https://example.com/content.jpg",
          text: "content overlay",
          section: "content",
        },
      ],
      tileCount: 2,
    })

    const rendered = JSON.stringify(markup)

    expect(rendered.match(/hook already in image/g)?.length).toBe(1)
    expect(rendered.match(/content overlay/g)?.length).toBe(2)
  })
})
