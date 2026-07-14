import { readFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/json-store", () => ({
  readJsonArrayStore: async (input: { fileName: string; key: string }) => {
    if (input.fileName !== "image-collections.json") return []
    const database = JSON.parse(
      await readFile(
        path.join(process.cwd(), "data", "image-collections.json"),
        "utf8"
      )
    ) as Record<string, unknown>
    return Array.isArray(database[input.key]) ? database[input.key] : []
  },
  writeJsonArrayStore: vi.fn(),
  withJsonArrayStore: vi.fn(),
}))

import {
  automationRunSlidesToSlideshowSlides,
  previewAutomationRunPlan,
  selectAutomationContentRoute,
} from "@/lib/automation-runner"
import type { AutomationSchema } from "@/lib/realfarm-automation"

afterEach(() => vi.unstubAllEnvs())

describe("general interior-design automation template", () => {
  it("routes a concrete hook into a relevant collection and records the format", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const automations = JSON.parse(
      await readFile(
        path.join(process.cwd(), "data", "automations", "automations.json"),
        "utf8"
      )
    ) as {
      automations: { id: string; schema: AutomationSchema }[]
    }
    const automation = automations.automations.find(
      (item) => item.id === "automation-curtains-renter-glowup"
    )
    expect(automation).toBeDefined()

    const collectionDatabase = JSON.parse(
      await readFile(
        path.join(process.cwd(), "data", "image-collections.json"),
        "utf8"
      )
    ) as { collections: { name: string; images: unknown[] }[] }
    const collection = collectionDatabase.collections.find(
      (item) => item.name === "Interior Design — Editorial Rooms"
    )
    expect(collection?.images.length).toBeGreaterThanOrEqual(100)
    expect(
      collectionDatabase.collections
        .filter((item) => item.name.startsWith("Interior Design — "))
        .filter((item) => item.name !== "Interior Design — Editorial Rooms")
        .every((item) => item.images.length >= 6)
    ).toBe(true)

    expect(
      selectAutomationContentRoute(
        automation!.schema,
        "4 kitchen finishes that won't date quickly"
      )
    ).toMatchObject({
      id: "kitchen-visual-decisions",
      format: "visual_decision",
      cta_strategy: "comment_prompt",
    })
    expect(
      selectAutomationContentRoute(
        automation!.schema,
        "avoid these 4 living room layout mistakes"
      )
    ).toMatchObject({
      format: "mistake_replacement",
      cta_strategy: "save_prompt",
    })
    expect(
      selectAutomationContentRoute(
        automation!.schema,
        "how i'd style a narrow living room"
      )
    ).toMatchObject({
      format: "designer_recommendation",
      cta_strategy: "customer_prompt",
    })
    const routedFormats = automation!.schema.prompt_formatting.narrative
      .split("\n")
      .map(
        (hook) => selectAutomationContentRoute(automation!.schema, hook)?.format
      )
    expect(routedFormats.every(Boolean)).toBe(true)
    expect(
      routedFormats.filter((format) => format === "visual_decision")
    ).toHaveLength(7)
    expect(
      routedFormats.filter((format) => format === "mistake_replacement")
    ).toHaveLength(3)
    expect(
      routedFormats.filter((format) => format === "designer_recommendation")
    ).toHaveLength(2)

    const preview = await previewAutomationRunPlan(automation!.schema, {
      automationId: "interior-template-smoke-test",
      random: () => 0.42,
    })

    expect(preview.status).toBe("succeeded")
    expect(preview.plan.contentStrategy).toMatchObject({
      format: "visual_decision",
      ctaStrategy: "comment_prompt",
    })
    expect(preview.plan.slides.map((slide) => slide.role)).toEqual([
      "hook",
      "content",
      "content",
      "content",
      "content",
      "cta",
    ])
    expect(
      new Set(preview.plan.slides.map((slide) => slide.imageUrl)).size
    ).toBe(6)
    expect(
      preview.plan.slides.every((slide) => slide.aspectRatio === "9:16")
    ).toBe(true)
    expect(
      preview.plan.slides.every((slide) =>
        slide.imageUrl.startsWith("/api/local-assets/image-collections/files/")
      )
    ).toBe(true)
    expect(
      preview.plan.slides.some(
        (slide) =>
          slide.text.toLowerCase().startsWith("write ") ||
          slide.text.includes("Photo by")
      )
    ).toBe(false)

    const rendered = automationRunSlidesToSlideshowSlides(
      automation!.schema,
      preview.plan
    )
    expect(rendered.every((slide) => slide.imageFit === "cover")).toBe(true)
  })
})
