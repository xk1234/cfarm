import { beforeEach, describe, expect, it, vi } from "vitest"

import { createLocalAutomationRecord } from "@/lib/automations"

const mocks = vi.hoisted(() => ({
  getAutomationRecord: vi.fn(),
  listWordCollections: vi.fn(),
  patchAutomationRecord: vi.fn(),
  previewAutomationRunPlan: vi.fn(),
}))

vi.mock("@/lib/automations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automations")>()),
  getAutomationRecord: mocks.getAutomationRecord,
  patchAutomationRecord: mocks.patchAutomationRecord,
}))

vi.mock("@/lib/word-collections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/word-collections")>()),
  listWordCollections: mocks.listWordCollections,
}))

vi.mock("@/lib/automation-runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-runner")>()),
  previewAutomationRunPlan: mocks.previewAutomationRunPlan,
}))

import {
  getAutomationExperimentDimensions,
  runAutomationExperiment,
} from "@/lib/automation-experiment"

describe("runAutomationExperiment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const record = createLocalAutomationRecord({ name: "Seed test" })
    record.schema.hooks = [
      {
        id: "hook-a",
        text: "Three [[ZODIAC]] ideas for [[CURRENT_YEAR]]",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "hook-b",
        text: "Try [[ZODIAC]] this week",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    mocks.getAutomationRecord.mockResolvedValue(record)
    mocks.listWordCollections.mockResolvedValue([
      {
        id: "zodiac",
        name: "Zodiac",
        words: ["Aries", "Taurus", "Gemini"],
        source: "manual",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    mocks.previewAutomationRunPlan.mockImplementation(
      async (_schema: unknown, input: { random?: () => number }) => {
        const draw = String(input.random?.())
        return {
          status: "succeeded",
          plan: {
            title: "",
            caption: "",
            hashtags: "",
            hook: draw,
            hookSubstitutions: { zodiac: draw },
            imageCollectionIds: [],
            slides: [],
            slideCount: { mode: "static", count: 0 },
            publishType: "slideshow",
            autoMusic: false,
            autoPost: false,
            language: "en",
          },
        }
      }
    )
  })

  it("uses deterministic per-cell random draws", async () => {
    const input = {
      automationId: "automation-id",
      vary: [{ dimension: "tone" as const, values: ["Bold"] }],
      repeats: 2,
    }
    const first = await runAutomationExperiment({ ...input, seed: 41 })
    const same = await runAutomationExperiment({ ...input, seed: 41 })
    const different = await runAutomationExperiment({ ...input, seed: 42 })

    expect(draws(first)).toEqual(draws(same))
    expect(draws(first)).not.toEqual(draws(different))
  })

  it("describes automation-level dimensions with their current values", async () => {
    const record = createLocalAutomationRecord({ name: "Dimensions test" })
    record.schema.tone.value = "Calm & Reflective"
    const body = record.schema.formatting.find((block) => block.id === "body")
    if (!body) throw new Error("Expected a body formatting block")
    body.textItems = body.textItems.map((item) => ({
      ...item,
      contentDirection: "One grounded recommendation",
    }))
    mocks.getAutomationRecord.mockResolvedValue(record)

    const dimensions = await getAutomationExperimentDimensions("automation-id")

    expect(dimensions.automationDimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "contentDirection",
          name: "hook",
          label: "Hook content direction",
          currentValue: expect.any(String),
        }),
        expect.objectContaining({
          dimension: "contentDirection",
          name: "body",
          label: "Body content direction",
          currentValue: "One grounded recommendation",
        }),
        expect.objectContaining({
          dimension: "contentDirection",
          name: "cta",
          label: "CTA content direction",
          currentValue: expect.any(String),
        }),
        expect.objectContaining({
          dimension: "tone",
          currentValue: "Calm & Reflective",
        }),
        expect.objectContaining({
          dimension: "model",
          currentValue: expect.stringContaining("/"),
        }),
      ])
    )
  })

  it("rejects experiments above the cell cap", async () => {
    await expect(
      runAutomationExperiment({
        automationId: "automation-id",
        vary: [
          {
            dimension: "tone",
            values: Array.from({ length: 201 }, (_, index) => `Tone ${index}`),
          },
        ],
        seed: 1,
      })
    ).rejects.toThrow("201 cells")
    expect(mocks.previewAutomationRunPlan).not.toHaveBeenCalled()
  })

  it("refuses runtime variables as sweep dimensions", async () => {
    await expect(
      runAutomationExperiment({
        automationId: "automation-id",
        vary: [
          {
            dimension: "variable",
            name: "current_year",
            values: ["2025", "2026"],
          },
        ],
      })
    ).rejects.toThrow("fixed and cannot be swept")
  })

  it("records a failed cell and continues", async () => {
    mocks.previewAutomationRunPlan
      .mockRejectedValueOnce(new Error("Model unavailable"))
      .mockImplementationOnce(async (_schema, input) => ({
        status: "succeeded",
        plan: {
          title: "",
          caption: "",
          hashtags: "",
          hook: String(input.random?.()),
          imageCollectionIds: [],
          slides: [],
          slideCount: { mode: "static", count: 0 },
          publishType: "slideshow",
          autoMusic: false,
          autoPost: false,
          language: "en",
        },
      }))
    const result = await runAutomationExperiment({
      automationId: "automation-id",
      vary: [{ dimension: "tone", values: ["Bold", "Calm"] }],
      seed: 1,
    })

    expect(result.cells).toHaveLength(2)
    expect(result.cells[0].error).toBe("Model unavailable")
    expect(result.cells[1].plan).toBeDefined()
  })

  it("never writes the saved automation record", async () => {
    await runAutomationExperiment({
      automationId: "automation-id",
      vary: [
        { dimension: "variable", name: "zodiac", values: ["Aries", "Taurus"] },
      ],
      seed: 7,
    })

    expect(mocks.patchAutomationRecord).not.toHaveBeenCalled()
  })
})

function draws(result: Awaited<ReturnType<typeof runAutomationExperiment>>) {
  return result.cells.map((cell) => cell.plan?.hookSubstitutions?.zodiac)
}

describe("holding everything but the varied input constant", () => {
  it("gives every cell of one repeat the same RNG stream", async () => {
    const streams: number[][] = []
    mocks.previewAutomationRunPlan.mockImplementation((async (
      _schema: unknown,
      options: { random?: () => number }
    ) => {
      streams.push([options.random!(), options.random!(), options.random!()])
      return {
        status: "succeeded",
        plan: {
          hook: "Try [[ZODIAC]] this week",
          hookTemplate: "Try [[ZODIAC]] this week",
          slides: [],
          hookSubstitutions: {},
        },
      }
    }) as never)

    await runAutomationExperiment({
      automationId: "a1",
      vary: [
        { dimension: "variable", name: "zodiac", values: ["leo", "virgo"] },
      ],
      seed: 7,
    })

    expect(streams).toHaveLength(2)
    // Same hook and image draws across the sweep: only the variable moved.
    expect(streams[0]).toEqual(streams[1])
  })

  it("gives separate repeats different streams so variance is measurable", async () => {
    const streams: number[][] = []
    mocks.previewAutomationRunPlan.mockImplementation((async (
      _schema: unknown,
      options: { random?: () => number }
    ) => {
      streams.push([options.random!(), options.random!()])
      return {
        status: "succeeded",
        plan: {
          hook: "Try [[ZODIAC]] this week",
          hookTemplate: "Try [[ZODIAC]] this week",
          slides: [],
          hookSubstitutions: {},
        },
      }
    }) as never)

    await runAutomationExperiment({
      automationId: "a1",
      vary: [{ dimension: "variable", name: "zodiac", values: ["leo"] }],
      repeats: 2,
      seed: 7,
    })

    expect(streams).toHaveLength(2)
    expect(streams[0]).not.toEqual(streams[1])
  })
})

describe("content direction sweeps", () => {
  it("varies only the targeted block's direction, holding the rest constant", async () => {
    const seen: {
      schema: Parameters<typeof stableSchemaWithoutBodyDirection>[0]
      textModel?: string
    }[] = []
    mocks.previewAutomationRunPlan.mockImplementation(
      async (
        schema: {
          formatting: {
            id: string
            textItems: { contentDirection: string; [key: string]: unknown }[]
            [key: string]: unknown
          }[]
          tone?: { value?: string }
          hooks?: unknown[]
          [key: string]: unknown
        },
        options: { textModel?: string }
      ) => {
        seen.push({
          schema: structuredClone(schema),
          textModel: options.textModel,
        })
        return {
          status: "succeeded",
          plan: {
            title: "",
            caption: "",
            hashtags: "",
            hook: "h",
            imageCollectionIds: [],
            slides: [],
            slideCount: { mode: "static", count: 0 },
            publishType: "slideshow",
            autoMusic: false,
            autoPost: false,
            language: "en",
          },
        }
      }
    )

    const uiRequest = {
      automationId: "a1",
      vary: [
        {
          dimension: "contentDirection" as const,
          name: "body",
          values: ["one concrete tip", "one surprising stat"],
        },
      ],
      allHooks: false,
      repeats: 1,
      seed: 4242,
    }
    await runAutomationExperiment(uiRequest)

    // Both directions were actually applied...
    expect(
      seen
        .map(
          (cell) =>
            cell.schema.formatting.find((block) => block.id === "body")
              ?.textItems[0]?.contentDirection
        )
        .sort()
    ).toEqual(["one concrete tip", "one surprising stat"])
    // ...and nothing else moved between cells, which is what makes the
    // comparison meaningful rather than confounded.
    expect(stableSchemaWithoutBodyDirection(seen[0].schema)).toEqual(
      stableSchemaWithoutBodyDirection(seen[1].schema)
    )
    expect(seen[0].textModel).toBe(seen[1].textModel)
  })

  it("keeps body and cta directions in separate columns", async () => {
    const { cells } = await runAutomationExperiment({
      automationId: "a1",
      vary: [
        { dimension: "contentDirection", name: "body", values: ["b1", "b2"] },
        { dimension: "contentDirection", name: "cta", values: ["c1", "c2"] },
      ],
    })
    // Without per-block keying both variations collapse onto one key and the
    // sweep silently produces 2 cells instead of 4.
    expect(cells).toHaveLength(4)
    expect(Object.keys(cells[0].variant).sort()).toEqual([
      "contentDirection:body",
      "contentDirection:cta",
    ])
  })
})

function stableSchemaWithoutBodyDirection(schema: {
  formatting: {
    id: string
    textItems: { contentDirection: string; [key: string]: unknown }[]
    [key: string]: unknown
  }[]
  [key: string]: unknown
}) {
  return {
    ...schema,
    formatting: schema.formatting.map((block) =>
      block.id === "body"
        ? {
            ...block,
            textItems: block.textItems.map((item) => ({
              ...item,
              contentDirection: "<varied>",
            })),
          }
        : block
    ),
  }
}
