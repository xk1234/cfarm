import { afterEach, describe, expect, it, vi } from "vitest"

import { planAutomationSlideSequence } from "@/lib/automation-runner"
import {
  automationSlideDesigns,
  defaultAutomationSchema,
  schemaWithAutomationHookItems,
  schemaWithAutomationSharedSlideStyle,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import { automationSchemaToTempSlideTestingAutomation } from "@/lib/temp-slide-testing"

const automation: Automation = {
  id: "sequence-test",
  name: "Sequence test",
  status: "live",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "education",
  socialIntegrations: [],
}

afterEach(() => vi.unstubAllEnvs())

describe("sequence-based slideshow templates", () => {
  it("migrates legacy format blocks into numbered independent designs", () => {
    const schema = defaultAutomationSchema(automation)
    const designs = automationSlideDesigns(schema)

    expect(designs.length).toBeGreaterThan(1)
    expect(designs.map((design) => design.name)).toEqual(
      designs.map((_, index) => `Slide ${index + 1}`)
    )
    expect(new Set(designs.map((design) => design.id)).size).toBe(
      designs.length
    )
  })

  it("builds every runtime slide from the agent-selected design sequence", () => {
    const schema = defaultAutomationSchema(automation)
    const [first, second] = automationSlideDesigns(schema)
    const runtime = automationSchemaToTempSlideTestingAutomation(schema, {
      id: automation.id,
      name: automation.name,
      slidePlan: [
        { designId: second.id, purpose: "Explain the idea" },
        { designId: first.id, purpose: "Close with the takeaway" },
        { designId: second.id, purpose: "Add one useful example" },
      ],
    })

    expect(runtime.slides).toHaveLength(3)
    expect(runtime.slides.map((slide) => slide.title)).toEqual([
      second.name,
      first.name,
      second.name,
    ])
    expect(runtime.slides.every((slide) => slide.section === "content")).toBe(
      true
    )
    expect(runtime.slides[0]?.textItems[0]?.contentDirection).toContain(
      "Explain the idea"
    )
  })

  it("applies global ratio and image grid settings to every slide", () => {
    const schema = defaultAutomationSchema(automation)
    const updated = schemaWithAutomationSharedSlideStyle(schema, {
      aspectRatio: "9:16",
      imageGrid: "2x2",
    })

    expect(updated.aspect_ratio).toBe("9:16")
    expect(
      automationSlideDesigns(updated).every(
        (design) => design.aspect_ratio === "9:16" && design.imageGrid === "2x2"
      )
    ).toBe(true)
    expect(
      updated.formatting.every(
        (section) =>
          section.aspect_ratio === "9:16" && section.imageGrid === "2x2"
      )
    ).toBe(true)
  })

  it("lets the text model choose a valid count and ordered design IDs", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    const schema = schemaWithAutomationHookItems(
      defaultAutomationSchema(automation),
      []
    )
    schema.prompt_formatting.slide_count_min = 2
    schema.prompt_formatting.slide_count_max = 4
    const designs = automationSlideDesigns(schema)
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    slides: [
                      { designId: designs[1]!.id, purpose: "Set up the idea" },
                      { designId: designs[0]!.id, purpose: "Land the point" },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    )

    await expect(
      planAutomationSlideSequence({
        schema,
        topic: "An original astrology explainer",
        automationTitle: automation.name,
        model: "openai/gpt-5.6-luna",
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toEqual([
      { designId: designs[1]!.id, purpose: "Set up the idea" },
      { designId: designs[0]!.id, purpose: "Land the point" },
    ])
  })
})
