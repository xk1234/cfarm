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

import { runAutomationExperiment } from "@/lib/automation-experiment"

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
      return { status: "succeeded", plan: { hook: "Try [[ZODIAC]] this week", hookTemplate: "Try [[ZODIAC]] this week", slides: [], hookSubstitutions: {} } }
    }) as never)

    await runAutomationExperiment({
      automationId: "a1",
      vary: [{ dimension: "variable", name: "zodiac", values: ["leo", "virgo"] }],
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
      return { status: "succeeded", plan: { hook: "Try [[ZODIAC]] this week", hookTemplate: "Try [[ZODIAC]] this week", slides: [], hookSubstitutions: {} } }
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
