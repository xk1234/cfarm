import { describe, expect, it } from "vitest"

import {
  classifyAutomation,
  classifyAutomationTemplate,
  classifyImageCollection,
  classifySlideshowResult,
  classifyXAutomation,
  classifyXAutomationRun,
} from "./classify"

describe("automation template shapes", () => {
  it("classifies canonical", () => {
    expect(
      classifyAutomationTemplate({
        id: "t1",
        createdAt: "2026-01-01T00:00:00.000Z",
        schema: { created_at: "2026-01-01T00:00:00.000Z", formatting: [] },
      })
    ).toMatchObject({ classification: "canonical", markers: [] })
  })

  it("classifies legacy and identifies exact storage signals", () => {
    const result = classifyAutomationTemplate({
      id: "t1",
      template: {
        created_at: "2025-01-01T00:00:00.000Z",
        image_collection_ids: '{"body":{}}',
        format: {
          hook: { image_grid: "2x2", text_items: [{ font_size: 20 }] },
        },
      },
    })
    expect(result.classification).toBe("legacy")
    expect(result.markers).toEqual(
      expect.arrayContaining([
        "template_object",
        "template.created_at:string",
        "template.image_collection_ids:string",
        "template.format:snake_case",
      ])
    )
  })

  it("classifies mixed", () => {
    expect(
      classifyAutomationTemplate({
        template: {},
        schema: { created_at: "2026-01-01T00:00:00Z" },
      }).classification
    ).toBe("mixed")
  })

  it("classifies invalid dates and stringified collections", () => {
    expect(
      classifyAutomationTemplate({ template: { created_at: "not-a-date" } })
    ).toMatchObject({
      classification: "invalid",
      markers: expect.arrayContaining(["template.created_at:string"]),
    })
    expect(
      classifyAutomationTemplate({ template: { image_collection_ids: "[1]" } })
        .classification
    ).toBe("invalid")
  })
})

describe("automation shapes", () => {
  it("classifies canonical", () => {
    expect(
      classifyAutomation({
        name: "A",
        status: "live",
        favorite: false,
        theme: "x",
        updatedAt: "2026-01-01T00:00:00Z",
        schema: { schedule: { posting_times: [] }, hooks: [] },
      })
    ).toMatchObject({ classification: "canonical", markers: [] })
  })

  it("classifies legacy aliases", () => {
    const result = classifyAutomation({
      schema: {
        title: "A",
        status: "live",
        knowledge_context_enabled: true,
        knowledge_base_ids: [],
        schedule: { interval: {} },
        formatting: [
          { id: "_tone" },
          {
            id: "hook",
            textItems: [{ contentDirection: "stored hook" }],
          },
          { slideOverrides: [{ content_direction: "x" }] },
        ],
        prompt_formatting: { narrative: "hook" },
      },
      account: "a",
      handle: "h",
      times: [],
    })
    expect(result.classification).toBe("legacy")
    expect(result.markers).toEqual(
      expect.arrayContaining([
        "schema.title",
        "schema.status",
        "top_level.account",
        "top_level.handle",
        "top_level.times",
        "schema.knowledge_context_enabled",
        "schema.knowledge_base_ids",
        "schema.schedule.interval",
        "schema.formatting._tone",
        "schema.hooks:missing_with_prompt_narrative",
        "schema.hooks:missing_with_formatting_hook",
        "schema.formatting.legacy_override_alias",
      ])
    )
  })

  it("classifies mixed canonical and legacy fields", () => {
    expect(
      classifyAutomation({
        name: "A",
        status: "live",
        schema: { title: "A", schedule: { posting_times: [] } },
      })
    ).toMatchObject({ classification: "mixed", markers: ["schema.title"] })
  })

  it("classifies invalid payloads and dates", () => {
    expect(classifyAutomation([]).classification).toBe("invalid")
    expect(
      classifyAutomation({ updatedAt: "yesterday", schema: {} }).classification
    ).toBe("invalid")
  })
})

describe("follow-up boundaries", () => {
  it("detects X automation niche, generation, and output aliases", () => {
    const result = classifyXAutomation({
      niche: { audience: "teams", painPoints: [] },
      generation: { hookPrompt: "x", voice: "bold" },
      output: { platforms: ["x"] },
    })
    expect(result).toMatchObject({
      classification: "legacy",
      markers: expect.arrayContaining([
        "niche.audience",
        "niche.painPoints",
        "generation.hookPrompt",
        "generation.voice",
        "output.platforms",
      ]),
    })
  })

  it("detects an X run platforms alias beside canonical platform", () => {
    expect(
      classifyXAutomationRun({ platform: "x", platforms: ["x"] })
    ).toMatchObject({ classification: "mixed", markers: ["platforms[]"] })
  })

  it("detects slideshow identity fallback", () => {
    expect(
      classifySlideshowResult({ id: "compat-run-123", artifacts: {} })
    ).toMatchObject({
      classification: "legacy",
      markers: expect.arrayContaining([
        "artifacts.slideshowId:missing",
        "id:compat-run",
      ]),
    })
  })

  it("detects image collection aliases and canonical ids", () => {
    expect(
      classifyImageCollection({
        id: "community_collection_1234",
        name: "My Set",
      })
    ).toMatchObject({
      classification: "legacy",
      markers: expect.arrayContaining(["id:path_alias", "id:not_name_slug"]),
    })
    expect(
      classifyImageCollection({ id: "my-set", name: "My Set" })
    ).toMatchObject({ classification: "canonical", markers: [] })
  })
})
