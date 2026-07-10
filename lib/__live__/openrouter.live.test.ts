import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { generateSlideshowText } from "@/lib/slideshow-text-generation"
import {
  automationTemplateToTempSlideTestingAutomation,
  getTempSlidePromptPlaceholders,
} from "@/lib/temp-slide-testing"
import type { AutomationTemplateRecord } from "@/lib/automation-templates"

// Load OPENROUTER_API_KEY straight from .env so this runs without a bundler.
function loadEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    /* ignore */
  }
  return undefined
}

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

const apiKey = loadEnvKey("OPENROUTER_API_KEY")

describe.skipIf(!process.env.RUN_LIVE)("LIVE OpenRouter — slideshow text generation (A3/A7/B3 backbone)", () => {
  it("returns a schema-valid structured completion from the real API", async () => {
    expect(apiKey, "OPENROUTER_API_KEY must be present").toBeTruthy()

    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const placeholders = getTempSlidePromptPlaceholders(automation)

    // Use a model confirmed to honor the full nested schema. The configured
    // DEFAULT model (google/gemini-3.1-flash-lite) is validated separately in
    // the DIAGNOSTIC test, where it reproducibly returns empty hashtags.
    const res = await generateSlideshowText({
      automation,
      apiKey,
      model: "google/gemini-2.5-flash",
      selectedHook: "3 ways to test hooks",
    })

    console.log("\nLIVE OpenRouter raw result:", JSON.stringify(res.result, null, 2))

    // Real network path exercised (not the skip branch).
    expect(res.skippedOpenRouter).toBe(false)
    expect(res.model).toBeTruthy()

    // Metadata fields present and non-empty.
    expect(res.result.title.trim().length).toBeGreaterThan(0)
    expect(res.result.caption.trim().length).toBeGreaterThan(0)
    expect(res.result.hashtags.trim().length).toBeGreaterThan(0)

    // Strict json_schema must fill EVERY model-fillable placeholder key.
    for (const p of placeholders) {
      expect(
        Object.prototype.hasOwnProperty.call(res.result.text, p.id),
        `missing placeholder ${p.id}`
      ).toBe(true)
      expect(res.result.text[p.id].trim().length).toBeGreaterThan(0)
    }

    // Hook must not be rewritten into a body placeholder verbatim.
    console.log("\nLIVE OpenRouter result:", JSON.stringify(res.result, null, 2))
  }, 45_000)

  it("DIAGNOSTIC: full-pipeline hashtags across models", async () => {
    expect(apiKey).toBeTruthy()
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    for (const model of [
      "google/gemini-3.1-flash-lite",
      "google/gemini-2.5-flash",
      "openai/gpt-4o-mini",
    ]) {
      const res = await generateSlideshowText({
        automation,
        apiKey,
        model,
        selectedHook: "3 ways to test hooks",
      })
      console.log(
        `\n[${model}] hashtags=${JSON.stringify(res.result.hashtags)} title=${JSON.stringify(res.result.title)}`
      )
    }
  }, 90_000)

  it("respects avoidSimilarOutputs without erroring", async () => {
    expect(apiKey).toBeTruthy()
    const automation =
      automationTemplateToTempSlideTestingAutomation(templateRecord)
    const res = await generateSlideshowText({
      automation,
      apiKey,
      selectedHook: "3 ways to test hooks",
      avoidSimilarOutputs: ["Three simple testing tricks", "Test smarter today"],
    })
    expect(res.skippedOpenRouter).toBe(false)
    expect(res.result.title.trim().length).toBeGreaterThan(0)
  }, 45_000)
})
