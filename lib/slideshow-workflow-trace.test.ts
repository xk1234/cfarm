import { describe, expect, it } from "vitest"

import type { AutomationRunRecord } from "@/lib/automation-runner"
import { buildSlideshowWorkflowTrace } from "@/lib/slideshow-workflow-trace"

describe("slideshow workflow trace", () => {
  it("reconstructs every production stage from a persisted run", () => {
    const run = {
      id: "run-1",
      automationId: "automation-1",
      automationTitle: "Astrology facts",
      scheduledFor: "2026-08-02T09:16:53.203Z",
      generationSource: "manual",
      status: "succeeded",
      slideshowId: "slideshow-1",
      outputImages: ["/rendered/slide-1.png", "/rendered/slide-2.png"],
      createdAt: "2026-08-02T09:16:53.203Z",
      updatedAt: "2026-08-02T09:17:00.528Z",
      plan: {
        title: "One thing Libra hides",
        caption: "A caption",
        hashtags: "#libra",
        hook: "1 thing a libra will never tell you",
        hookId: "hook-1",
        hookTemplate: "[[SLIDE_COUNT]] thing a [[ZODIAC]] will never tell you",
        hookSubstitutions: { SLIDE_COUNT: "1", ZODIAC: "libra" },
        imageCollectionIds: ["collection-1"],
        slides: [
          {
            id: "slide-1",
            role: "hook",
            imageUrl: "/source/slide-1.jpg",
            imageKey: "image-1",
            imageCaption: "Portrait",
            text: "1 thing a libra will never tell you",
            textItems: [
              { id: "hook", text: "1 thing a libra will never tell you" },
            ],
          },
          {
            id: "slide-2",
            role: "content",
            imageUrl: "/source/slide-2.jpg",
            imageKey: "image-2",
            imageCaption: "Quiet room",
            text: "quiet resentment",
            textItems: [{ id: "heading", text: "quiet resentment" }],
          },
        ],
        slideCount: { mode: "static", count: 1 },
        publishType: "slideshow",
        autoMusic: true,
        autoPost: false,
        textModel: "openai/gpt-5.6-luna",
        language: "en",
        debug: {
          selectedHookIndex: 0,
          textModelPrompt: {
            messages: [{ role: "user", content: "Write one body slide" }],
          },
          textSimilarityRetry: false,
          webSearchSources: [],
        },
      },
    } as unknown as AutomationRunRecord

    const trace = buildSlideshowWorkflowTrace({ run })

    expect(trace.workflowId).toBe("slideshow-generation")
    expect(trace.runId).toBe("run-1")
    expect(trace.outputId).toBe("slideshow-1")
    expect(trace.stages).toHaveLength(16)
    expect(trace.stages.map((stage) => stage.order)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1)
    )
    expect(
      trace.stages.find(
        (stage) => stage.id === "slideshow-generation.build-text-prompt"
      )?.output
    ).toMatchObject({
      promptPayload: {
        messages: [{ role: "user", content: "Write one body slide" }],
      },
    })
    expect(
      trace.stages.find(
        (stage) => stage.id === "slideshow-generation.select-slide-images"
      )?.output
    ).toMatchObject({
      selectedImages: [
        expect.objectContaining({ slide: 1, imageKey: "image-1" }),
        expect.objectContaining({ slide: 2, imageKey: "image-2" }),
      ],
    })
    expect(
      trace.stages.find(
        (stage) => stage.id === "slideshow-generation.translate-plan"
      )?.status
    ).toBe("skipped")
    expect(trace.output).toMatchObject({
      title: "One thing Libra hides",
      slideCount: 2,
    })
    expect(trace.output.slides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          renderedImageUrl: "/rendered/slide-1.png",
        }),
      ])
    )
  })
})
