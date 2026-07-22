import { afterEach, describe, expect, it, vi } from "vitest"


afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("POST /api/temp/testing-center/generate", () => {
  it("generates metadata for hook-only templates with no model-fillable slide text", async () => {
    const result = {
      title: "Cute Nail Ideas",
      caption: "",
      hashtags: "#nails #beauty #style",
      text: {},
    }
    const plan = {
      textModel: "anthropic/claude-sonnet-4.5",
      hook: "cute nail designs i found on pinterest",
      debug: { textGenerationResult: result },
    }
    const previewAutomationRunPlan = vi.fn(async () => ({
      status: "succeeded",
      plan,
    }))
    vi.doMock("@/lib/automation-runner", () => ({
      previewAutomationRunPlan,
    }))
    vi.doMock("@/lib/automation-templates", () => ({
      listAutomationTemplateRecords: vi.fn(async () => [hookOnlyTemplate]),
      automationTemplateSchemaToRuntime: vi.fn(() => ({
        title: hookOnlyTemplate.name,
      })),
    }))

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/temp/testing-center/generate", {
        method: "POST",
        body: JSON.stringify({
          automationId: "template-hook-only",
          model: "anthropic/claude-sonnet-4.5",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(previewAutomationRunPlan).toHaveBeenCalledWith(
      { title: hookOnlyTemplate.name },
      expect.objectContaining({
        automationId: "template-hook-only",
        textModel: "anthropic/claude-sonnet-4.5",
        includeTextGenerationResult: true,
      })
    )
    expect(payload).toMatchObject({
      automationId: "template-hook-only",
      model: "anthropic/claude-sonnet-4.5",
      selectedHook: "cute nail designs i found on pinterest",
      result,
      status: "succeeded",
      plan,
    })
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hookOnlyTemplate: any = {
  id: "template-hook-only",
  name: "Nail Designs2",
  theme: "nail-designs",
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  template: {
    created_at: "2026-07-03T00:00:00.000Z",
    image_collection_ids: JSON.stringify({
      first_slide: { collection: "collection-nails" },
      all_slides: "collection-nails",
    }),
    hooks: ["cute nail designs i found on pinterest"],
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
            font_size: "10px",
            text_style: "white-bg",
            text_position: "center",
            text_item_width: "60%",
            word_length_min: 5,
            word_length_max: 10,
            content_direction: "hook introducing the topic, lowercase",
            text_mode: "prompt",
            static_text: "",
            text_align: "center",
            text_anchor: "padded",
          },
        ],
      },
      content: {
        aspect_ratio: "9:16",
        image_grid: "none",
        slide_count_mode: "static",
        slide_count: 1,
        overlay: false,
        display_text: false,
        text_items: [],
      },
      cta: {
        enabled: false,
        image_mode: "collection",
        aspect_ratio: "9:16",
        image_grid: "none",
        overlay: false,
        display_text: false,
        text_items: [],
      },
      tone: "Custom",
      custom_tone:
        "Each slideshow should contain image-only content slides after the fixed hook.",
    },
  },
}
