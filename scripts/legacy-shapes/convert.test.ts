import { describe, expect, it } from "vitest"
import { normalizeAutomationSchema } from "../../lib/realfarm-automation"
import type { Automation } from "../../lib/realfarm-data"
import {
  convertAutomationTemplateV1toV2,
  convertAutomationV1toV2,
} from "./convert"

const textItem = {
  id: "headline",
  font: "Inter",
  font_size: "48",
  text_style: "bold",
  text_position: "center",
  text_item_width: "wide",
  word_length_min: 3,
  word_length_max: 8,
  content_direction: "A sharp opening",
  text_mode: "prompt" as const,
  static_text: "",
  text_align: "center",
  text_anchor: "middle",
  text_vertical_anchor: "padded",
}
const section = {
  aspect_ratio: "9:16",
  image_grid: "none",
  overlay: false,
  display_text: true,
  ai_image_selection: true,
  text_items: [textItem],
}
const legacyTemplate = {
  id: "template-1",
  automationKind: "slideshow",
  name: "Template One",
  theme: "editorial",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  template: {
    created_at: "2026-07-01T00:00:00.000Z",
    image_collection_ids: JSON.stringify({
      first_slide: { collection: "opening" },
      all_slides: "body",
      cta_slide: { check: false },
    }),
    hooks: ["Hook one", "Hook two"],
    web_search_enabled: true,
    format: {
      hook: section,
      content: {
        ...section,
        slide_count_mode: "varying",
        slide_count: 4,
        slide_count_min: 3,
        slide_count_max: 6,
        overlay_image: { enabled: true, collection_id: "logos", height: 12 },
      },
      cta: { ...section, enabled: true, image_mode: "collection" },
      tone: "Custom",
      custom_tone: "Precise and warm",
    },
  },
}

describe("automation template v1 to v2", () => {
  it("maps the legacy wrapper and every nested naming family", () => {
    const result = convertAutomationTemplateV1toV2(legacyTemplate)
    expect(result.changed).toBe(true)
    expect(result.data).not.toHaveProperty("template")
    expect(result.data.schema).toMatchObject({
      created_at: "2026-07-01T00:00:00.000Z",
      web_search_enabled: true,
      image_collection_ids: { all_slides: "body" },
    })
    expect(result.data.schema).toHaveProperty("formatting.1.overlayImage", {
      enabled: true,
      collectionId: "logos",
      padding: 12,
    })
    expect(result.data.schema).toHaveProperty(
      "formatting.0.textItems.0.fontSize",
      "48"
    )
    expect(result.data.schema).toHaveProperty(
      "formatting.0.textItems.0.contentDirection",
      "A sharp opening"
    )
    expect(result.data.schema).toHaveProperty("formatting.0.noText", false)
    expect(result.data.schema).toHaveProperty("hooks.0.text", "Hook one")
  })

  it("is idempotent", () => {
    const once = convertAutomationTemplateV1toV2(legacyTemplate)
    expect(convertAutomationTemplateV1toV2(once.data)).toEqual({
      changed: false,
      data: once.data,
      droppedPaths: [],
      warnings: [],
    })
  })

})

describe("automation v1 to v2", () => {
  const summary: Automation = {
    id: "a1",
    name: "Automation",
    status: "live",
    account: "Account",
    handle: "@account",
    times: [],
    favorite: true,
    theme: "ugc",
    socialIntegrations: [],
  }
  const base = normalizeAutomationSchema({} as never, summary)
  const mixed = {
    id: "a1",
    name: "Automation",
    status: "live",
    account: "Account",
    handle: "@account",
    times: ["11:59 PM"],
    favorite: true,
    theme: "ugc",
    updatedAt: "2026-07-02T00:00:00.000Z",
    schema: {
      ...base,
      title: "Automation",
      status: "live",
      knowledge_context_enabled: true,
      knowledge_base_ids: ["old"],
      schedule: {
        timezone: "Asia/Singapore",
        posting_times: [],
        interval: {
          every_n_hours: 4,
          start_time: "9:00 AM",
          end_time: "1:00 PM",
          days: ["Mon"],
        },
      },
    },
  }

  it("drops summaries and aliases while materializing normalized config", () => {
    const result = convertAutomationV1toV2(mixed)
    expect(result.changed).toBe(true)
    expect(result.data).not.toHaveProperty("account")
    expect(result.data).not.toHaveProperty("handle")
    expect(result.data).not.toHaveProperty("times")
    expect(result.data.schema).not.toHaveProperty("title")
    expect(result.data.schema).not.toHaveProperty("status")
    expect(result.data.schema).not.toHaveProperty("knowledge_context_enabled")
    expect(result.data.schema).not.toHaveProperty("knowledge_base_ids")
    expect(result.data.schema).not.toHaveProperty("schedule.interval")
    expect(result.data.schema).toHaveProperty(
      "schedule.posting_times.0.time",
      "9:00 AM"
    )
  })

  it("is idempotent without the removed production v1 reader", () => {
    const once = convertAutomationV1toV2(mixed)
    expect(convertAutomationV1toV2(once.data).changed).toBe(false)
  })

  it("blocks disagreement between canonical metadata and nested aliases", () => {
    const result = convertAutomationV1toV2({
      ...mixed,
      schema: { ...mixed.schema, title: "Different" },
    })
    expect(result.changed).toBe(false)
    expect(result.warnings).toContain(
      "BLOCKED_CONFLICT: schema.title differs from authoritative name"
    )
  })
})
