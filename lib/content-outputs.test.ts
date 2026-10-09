import { describe, expect, it } from "vitest"

import {
  outputFromGeneratedPost,
  outputFromSlideshow,
} from "@/lib/content-outputs"
import type { SlideshowRecord } from "@/lib/slideshows"
import type { XAutomationRun } from "@/lib/x-automation"

describe("content output adapters", () => {
  it("treats a generated slideshow as a draft and preserves image order", () => {
    const output = outputFromSlideshow({
      id: "show-1",
      automationId: "template-1",
      title: "Signs",
      caption: "caption",
      hashtags: "",
      prompt: "",
      image_collection: "",
      slideshow_type: "image",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      status: "exported",
      output_images: ["/one.png", "/two.png"],
      images: [],
      settings: {
        duration: 3,
        aspect_ratio: "4:5",
        font: "Inter",
        background_color: "#000000",
        transition_style: "none",
        export_as_video: false,
        sound_id: "",
        sound_name: "",
        sound_url: "",
      },
    } satisfies SlideshowRecord)

    expect(output).toMatchObject({
      kind: "slideshow",
      status: "draft",
      templateId: "template-1",
    })
    expect(output.media.map((item) => item.url)).toEqual([
      "/one.png",
      "/two.png",
    ])
  })

  it("keeps generated text composable and in draft status", () => {
    const run = {
      id: "post-1",
      automationId: "template-2",
      automationName: "Post template",
      topic: "Saturn return",
      contentType: "single",
      platform: "x",
      reactionMode: "none",
      hook: "hook",
      setup: "",
      content: [],
      proof: "",
      curiosityGap: "",
      cta: "",
      posts: [
        {
          id: "p1",
          text: "Saturn return is not a punishment.",
          characterCount: 35,
          role: "content",
        },
      ],
      imageUrls: [],
      benchmark: {
        total: 80,
        hook: 80,
        specificity: 80,
        readability: 80,
        cta: 80,
        formatFit: 80,
        stageCompleteness: 80,
        archetypeFit: 80,
        comparison: { archetype: "contrarian_take", target: "native" },
        notes: [],
      },
      status: "draft",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    } as XAutomationRun

    expect(outputFromGeneratedPost(run)).toMatchObject({
      kind: "text",
      status: "draft",
      templateId: "template-2",
    })
  })
})
