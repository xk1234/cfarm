import { describe, expect, it } from "vitest"

import { selectSlideshowHook } from "@/lib/slideshow-generation-engine"
import {
  resolveSlideshowCaption,
  selectedBodySlideCount,
  slideSpecs,
  slideshowMetadataPromptInstructions,
  slideshowStructurePromptInstructions,
} from "@/lib/slideshow-plan-core"

describe("slideshow plan metadata and hook overrides", () => {
  it("makes the deterministic hook-caption owner explicit in the prompt", () => {
    const instructions = slideshowMetadataPromptInstructions({
      tiktok_post_settings: {
        caption: {
          mode: "prompt",
          prompt_text:
            'this should be in "lowercase," same exact text as the first text item.',
        },
        description: {
          mode: "prompt",
          prompt_text: "give me 3-5 broad hashtags related to astrology",
        },
      },
    })

    expect(instructions).toContain(
      "Caption requirement: return exactly the selected Hook text above; this policy is also enforced deterministically after generation."
    )
    expect(instructions).toContain(
      "Hashtags requirement: give me 3-5 broad hashtags related to astrology"
    )
  })

  it("deterministically honors an exact first-text-item caption instruction", () => {
    expect(
      resolveSlideshowCaption({
        setting: {
          mode: "prompt",
          prompt_text:
            'this should be in "lowercase," same exact text as the first text item.',
        },
        generated: "A different model-written caption",
        hook: "May Gemini vs. June Gemini",
      })
    ).toBe("may gemini vs. june gemini")
  })

  it("uses the canonical hook-caption policy without a free-text prompt", () => {
    const setting = {
      mode: "prompt" as const,
      static_text: "",
      prompt_text: "",
      resolution: "hook" as const,
    }
    expect(
      slideshowMetadataPromptInstructions({
        tiktok_post_settings: { caption: setting },
      })
    ).toContain(
      "Caption requirement: return exactly the selected Hook text above"
    )
    expect(
      resolveSlideshowCaption({
        setting,
        generated: "A different model-written caption",
        hook: "May Gemini vs. June Gemini",
      })
    ).toBe("May Gemini vs. June Gemini")
  })

  it("keeps structural style rules separate from tone", () => {
    expect(
      slideshowStructurePromptInstructions({
        prompt_formatting: {
          style: "Use a two-word heading followed by one supporting paragraph.",
        },
      })
    ).toBe(
      "Structural style rules (govern organization and format only; Tone still controls register, diction, rhythm, and casing):\nUse a two-word heading followed by one supporting paragraph."
    )
  })

  it("uses a hook body-slide override for SLIDE_COUNT and returns its tone", () => {
    const selection = selectSlideshowHook({
      hookItems: [
        {
          id: "all-signs",
          text: "[[SLIDE_COUNT]] zodiac signs, ranked",
          bodySlideCount: 12,
          tone: "Shadow voice",
        },
      ],
      wordCollections: [],
      now: new Date("2026-07-26T00:00:00.000Z"),
      slideCount: 5,
      selectIndex: () => 0,
    })

    expect(selection).toMatchObject({
      hookId: "all-signs",
      bodySlideCount: 12,
      tone: "Shadow voice",
      expansion: {
        text: "12 zodiac signs, ranked",
        substitutions: { SLIDE_COUNT: "12" },
      },
    })
  })

  it("plans exactly one hook slide when content and CTA are disabled", () => {
    const schema = {
      formatting: [
        { id: "hook", slideCount: 1, textItems: [], noText: true },
        {
          id: "body",
          slideCount: 0,
          slideCountMode: "static",
          textItems: [],
          noText: true,
        },
        { id: "cta", slideCount: 0, textItems: [], noText: true },
      ],
      image_collection_ids: {
        first_slide: { collection: "photos" },
        all_slides: "photos",
        cta_slide: { check: false, cta_collection_id: "" },
      },
    }

    expect(selectedBodySlideCount(schema, 0)).toBe(0)
    expect(slideSpecs(schema, "Random photo", 0)).toHaveLength(1)
    expect(slideSpecs(schema, "Random photo", 0)[0]).toMatchObject({
      section: "hook",
      index: 0,
      displayText: false,
    })
  })
})
