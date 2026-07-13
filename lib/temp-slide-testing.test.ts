import { describe, expect, it } from "vitest"

import type { AutomationTemplateRecord } from "@/lib/automation-templates"
import {
  automationFormatSection,
  defaultAutomationSchema,
  updateAutomationFormatSection,
} from "@/lib/realfarm-automation"
import {
  automationSchemaToTempSlideTestingAutomation,
  automationTemplateToTempSlideTestingAutomation,
  buildTempSlideUserPrompt,
  buildTempSlideStructuredOutputSchema,
  defaultTempSlideUserInstructions,
  defaultTempSlideSystemPrompt,
  getTempSlidePromptPlaceholders,
  promptPreviewHook,
  normalizeTempSlideStructuredOutput,
  storedCollectionsToTempSlideCollections,
} from "@/lib/temp-slide-testing"

describe("temp slide testing helpers", () => {
  it("gives the hook and content direction priority over stale global style", () => {
    expect(defaultTempSlideSystemPrompt).toContain(
      "The selected hook defines the slideshow topic"
    )
    expect(defaultTempSlideSystemPrompt).toContain(
      "outrank automation names, global style, tone, examples, and legacy template language"
    )
    expect(defaultTempSlideSystemPrompt).toContain(
      "ignore any part that changes the topic"
    )
  })
  it("keeps CTA disabled in a new automation until its section is enabled", () => {
    const schema = defaultAutomationSchema({
      id: "cta-default",
      name: "CTA default",
      status: "live",
      account: "",
      handle: "",
      times: [],
      favorite: false,
      theme: "default",
      socialIntegrations: [],
    })
    expect(schema.image_collection_ids.cta_slide.check).toBe(false)
    expect(
      automationSchemaToTempSlideTestingAutomation(schema).slides.some(
        (slide) => slide.section === "cta"
      )
    ).toBe(false)
  })

  it("applies content direction and image overrides to the exact generated slide", () => {
    const base = defaultAutomationSchema({
      id: "1",
      name: "Control audit",
      status: "live",
      account: "",
      handle: "",
      times: [],
      favorite: false,
      theme: "default",
      socialIntegrations: [],
    })
    const body = automationFormatSection(base, "content")
    const schema = updateAutomationFormatSection(base, "content", {
      slideCount: 2,
      slideOverrides: [
        { slideIndex: 2, contentDirection: "second slide only" },
      ],
      imageOverrides: [{ slideIndex: 2, collectionId: "override-collection" }],
      textItems: [
        { ...body.textItems[0], id: "body-text", contentDirection: "default" },
      ],
    })

    const automation = automationSchemaToTempSlideTestingAutomation(schema)
    const contentSlides = automation.slides.filter(
      (slide) => slide.section === "content"
    )
    expect(contentSlides[0].textItems[0].contentDirection).toBe("default")
    expect(contentSlides[1].textItems[0].contentDirection).toBe(
      "second slide only"
    )
    expect(contentSlides[1].collectionId).toBe("override-collection")
  })

  it("maps automation templates into hook, content, and cta slide specs", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)

    expect(automation).toMatchObject({
      id: "template-test",
      name: "Test Automation",
      imageCollectionIds: {
        hook: "collection-hook",
        content: "collection-content",
        cta: "collection-cta",
      },
    })
    expect(automation.slides.map((slide) => slide.id)).toEqual([
      "hook-1",
      "content-2",
      "content-3",
      "cta-4",
    ])
    expect(automation.slides[1].textItems[0]).toMatchObject({
      id: "content-2__body-title",
      contentDirection: "specific numbered point",
    })
    expect(automation.slides[1].overlayImage).toEqual({
      enabled: true,
      collectionId: "community_collection_11436",
      height: 5,
    })
  })

  it("builds strict structured output keyed by prompt placeholder ids", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const placeholders = getTempSlidePromptPlaceholders(automation)
    const schema = buildTempSlideStructuredOutputSchema(placeholders)

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
        },
        caption: {
          type: "string",
        },
        hashtags: {
          type: "string",
        },
        text: {
          type: "object",
          additionalProperties: false,
        },
      },
      required: ["title", "caption", "hashtags", "text"],
    })
    expect(schema.properties.text.required).not.toContain("hook-1__hook-title")
    expect(schema.properties.text.required).toContain("content-2__body-title")
    expect(schema.properties.text.required).not.toContain("cta-4__cta-static")
  })

  it("keeps the fixed hook out of model-fillable placeholders", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const placeholders = getTempSlidePromptPlaceholders(automation)
    const prompt = buildTempSlideUserPrompt({
      automationName: automation.name,
      hook: promptPreviewHook(automation),
      tone: automation.tone,
      style: automation.style,
      promptInstructions: defaultTempSlideUserInstructions,
      placeholders,
    })

    expect(prompt).toContain("Hook: 3 ways to test hooks")
    expect(prompt).not.toContain("hook-1__hook-title")
    expect(
      placeholders.map((placeholder) => placeholder.section)
    ).not.toContain("hook")
  })

  it("makes the selected hook the source of truth for every body placeholder", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const prompt = buildTempSlideUserPrompt({
      automationName: "Legacy automation title",
      hook: "why capricorns never forget a broken promise",
      tone: automation.tone,
      style: "Use a generic numbered-list format.",
      promptInstructions: defaultTempSlideUserInstructions,
      placeholders: getTempSlidePromptPlaceholders(automation),
    })

    expect(prompt).toContain(
      "The selected Hook above is the source of truth for this one slideshow"
    )
    expect(prompt).toContain(
      "Every body slide must directly answer, explain, support, exemplify, or continue that exact hook"
    )
    expect(prompt).toContain(
      "Text boxes sharing the same slide id are one unit"
    )
    expect(prompt).toContain(
      "treat it as format—not as permission to change topics"
    )
  })

  it("recovers fixed-hook image-only templates from imported style instructions", () => {
    const automation = automationTemplateToTempSlideTestingAutomation({
      ...templateRecord,
      id: "template-nail-designs",
      name: "Nail Designs",
      template: {
        ...templateRecord.template,
        hooks: ["cute nail designs i found on pinterest"],
        format: {
          ...templateRecord.template.format,
          hook: {
            ...templateRecord.template.format.hook,
            display_text: true,
            text_items: [],
          },
          content: {
            ...templateRecord.template.format.content,
            display_text: false,
            text_items: [],
            slide_count_mode: "static",
            slide_count: 1,
          },
          cta: {
            ...templateRecord.template.format.cta,
            enabled: false,
            display_text: false,
            text_items: [],
          },
          tone: "Custom",
          custom_tone:
            "Each slideshow should contain EXACTLY 7 slides. The first slide should have 1 text item SMALL font size in 60% WIDTH and in lowercase that says the hook.",
        },
      },
    })
    const placeholders = getTempSlidePromptPlaceholders(automation)

    expect(automation.slides).toHaveLength(7)
    expect(automation.slides[0].textItems).toEqual([
      expect.objectContaining({
        id: "hook-1__fixed-hook",
        section: "hook",
        textMode: "prompt",
        textStyle: "background",
        textItemWidth: "60%",
      }),
    ])
    expect(placeholders).toHaveLength(0)
  })

  it("does not repeat word counts when content directions already include them", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const placeholders = getTempSlidePromptPlaceholders(automation).map(
      (placeholder) =>
        placeholder.id === "content-2__body-title"
          ? {
              ...placeholder,
              contentDirection:
                "supporting explanation, 15-25 words, all lowercase",
              wordLengthMin: 15,
              wordLengthMax: 25,
            }
          : placeholder
    )
    const schema = buildTempSlideStructuredOutputSchema(placeholders)
    const description =
      schema.properties.text.properties["content-2__body-title"].description
    const prompt = buildTempSlideUserPrompt({
      automationName: automation.name,
      hook: promptPreviewHook(automation),
      tone: automation.tone,
      style: automation.style,
      promptInstructions: defaultTempSlideUserInstructions,
      placeholders,
    })

    expect(description.match(/15-25 words/g)).toHaveLength(1)
    expect(
      prompt
        .split("\n")
        .find((line) => line.includes("content-2__body-title"))
        ?.match(/15-25 words/g)
    ).toHaveLength(1)
  })

  it("normalizes missing model output to empty strings for every prompt placeholder", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const placeholders = getTempSlidePromptPlaceholders(automation)
    const normalized = normalizeTempSlideStructuredOutput(
      {
        title: "Useful test hooks",
        caption: "Try these hook ideas for your next post.",
        hashtags: "#testing #hooks #content",
        text: {
          "hook-1__hook-title": "3 ways to test hooks",
        },
      },
      placeholders
    )

    expect(normalized.text["hook-1__hook-title"]).toBeUndefined()
    expect(normalized.text["content-2__body-title"]).toBe("")
    expect(normalized.title).toBe("Useful test hooks")
    expect(normalized.caption).toBe("Try these hook ideas for your next post.")
    expect(normalized.hashtags).toBe("#testing #hooks #content")
  })

  it("builds the full user prompt with dynamic automation context", () => {
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const placeholders = getTempSlidePromptPlaceholders(automation)
    const prompt = buildTempSlideUserPrompt({
      automationName: automation.name,
      hook: promptPreviewHook(automation),
      tone: automation.tone,
      style: automation.style,
      promptInstructions: defaultTempSlideUserInstructions,
      placeholders,
    })

    expect(prompt).toContain("Automation: Test Automation")
    expect(prompt).toContain("Hook: 3 ways to test hooks")
    expect(prompt).toContain("Tone: Educational & Informative")
    expect(prompt).toContain("Metadata requirements:")
    expect(prompt).toContain(
      "give me 3-5 broad hashtags related to the topic/niche of the content"
    )
    expect(prompt).toContain("Prompt instructions:")
    expect(prompt).toContain(defaultTempSlideUserInstructions)
    expect(prompt).not.toContain("hook-1__hook-title")
    expect(prompt).toContain("content-2__body-title")
  })

  it("converts stored image collections into renderable temp collections", () => {
    const collections = storedCollectionsToTempSlideCollections([
      {
        name: "Hook",
        created_at: "2026-07-03T00:00:00.000Z",
        images: [
          {
            image_link: "/api/local-assets/image-collections/files/a.jpg",
            caption: "Desk scene",
          },
          {
            image_link:
              "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568.jpg",
            caption: "NDE overlay",
          },
        ],
      },
    ])

    expect(collections[0]).toMatchObject({
      id: "collection-hook-2026-07-03t00-00-00-000z",
      aliases: [
        "collection-hook-2026-07-03t00-00-00-000z",
        "Hook",
        "community_collection_11436",
        "user_collection_11436",
      ],
      title: "Hook",
      images: [
        {
          imageUrl: "/api/local-assets/image-collections/files/a.jpg",
          description: "Desk scene",
        },
        {
          imageUrl:
            "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568.jpg",
          description: "NDE overlay",
        },
      ],
    })
  })
})

const templateRecord: AutomationTemplateRecord = {
  id: "template-test",
  name: "Test Automation",
  theme: "testing",
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  template: {
    created_at: "2026-07-03T00:00:00.000Z",
    image_collection_ids: JSON.stringify({
      first_slide: { collection: "collection-hook" },
      all_slides: "collection-content",
      cta_slide: { cta_collection_id: "collection-cta" },
    }),
    hooks: ["3 ways to test hooks"],
    format: {
      hook: {
        aspect_ratio: "9:16",
        image_grid: "none",
        overlay: true,
        display_text: true,
        text_items: [
          {
            id: "hook-title",
            font: "TikTok Display Medium",
            font_size: "14px",
            text_style: "outline",
            text_position: "center",
            text_item_width: "80%",
            word_length_min: 5,
            word_length_max: 10,
            content_direction: "lowercase hook",
            text_mode: "prompt",
            static_text: "",
            text_align: "center",
            text_anchor: "padded",
          },
        ],
      },
      content: {
        aspect_ratio: "9:16",
        image_grid: "1x2",
        slide_count_mode: "static",
        slide_count: 2,
        overlay: false,
        overlay_image: {
          enabled: true,
          collection_id: "community_collection_11436",
          height: 5,
        },
        display_text: true,
        text_items: [
          {
            id: "body-title",
            font: "TikTok Display Medium",
            font_size: "12px",
            text_style: "outline",
            text_position: "center",
            text_item_width: "80%",
            word_length_min: 4,
            word_length_max: 8,
            content_direction: "specific numbered point",
            text_mode: "prompt",
            static_text: "",
            text_align: "center",
            text_anchor: "padded",
          },
        ],
      },
      cta: {
        enabled: true,
        image_mode: "collection",
        aspect_ratio: "9:16",
        image_grid: "none",
        overlay: true,
        display_text: true,
        text_items: [
          {
            id: "cta-static",
            font: "TikTok Display Medium",
            font_size: "12px",
            text_style: "outline",
            text_position: "bottom",
            text_item_width: "80%",
            word_length_min: 3,
            word_length_max: 6,
            content_direction: "",
            text_mode: "static",
            static_text: "follow for more",
            text_align: "center",
            text_anchor: "padded",
          },
        ],
      },
      tone: "Educational & Informative",
      custom_tone: "direct and test-focused",
    },
  },
}
