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

  it("uses rendered automation slides when final slideshow output exists", () => {
    const slideshows = generatedExampleSlideshows([
      {
        id: "automation-run-1",
        automationTitle: "Daily Mindset",
        plan: {
          title: "Planned title",
          slides: [
            {
              id: "planned",
              imageUrl: "https://example.com/planned.jpg",
              text: "Planned slide",
            },
          ],
        },
        renderedSlides: [
          {
            id: "rendered-hook",
            sourceImageUrl: "https://example.com/rendered-source.jpg",
            text: "Rendered hook",
            durationMs: 5000,
          },
          {
            id: "rendered-content",
            role: "content",
            imageUrl: "https://example.com/rendered.jpg",
            text: "Rendered content",
            durationMs: 3000,
          },
        ],
      },
    ])

    expect(slideshows).toMatchObject([
      {
        id: "automation-run-1",
        title: "Planned title",
        caption: "Rendered hook",
        durationSeconds: 8,
        slides: [
          {
            id: "automation-run-1-rendered-hook",
            imageUrl: "https://example.com/rendered-source.jpg",
            text: "Rendered hook",
            section: "hook",
            durationSeconds: 5,
          },
          {
            id: "automation-run-1-rendered-content",
            imageUrl: "https://example.com/rendered.jpg",
            text: "Rendered content",
            section: "content",
            durationSeconds: 3,
          },
        ],
      },
    ])
  })

  it("does not paint extra text over any already-rendered slide preview", () => {
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
          text: "content already in image",
          section: "content",
        },
      ],
      tileCount: 2,
    })

    const rendered = JSON.stringify(markup)

    expect(rendered.match(/hook already in image/g)?.length).toBe(1)
    expect(rendered.match(/content already in image/g)?.length).toBe(1)
  })
})
