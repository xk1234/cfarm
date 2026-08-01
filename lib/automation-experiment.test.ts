import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createLocalAutomationRecord,
  type AutomationRecord,
} from "@/lib/automations"
import {
  automationFormatSection,
  updateAutomationFormatSection,
  type AutomationSchema,
} from "@/lib/realfarm-automation"

const mocks = vi.hoisted(() => ({
  getAutomationRecord: vi.fn(),
  patchAutomationRecord: vi.fn(),
  previewAutomationRunPlan: vi.fn(),
}))

vi.mock("@/lib/automations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automations")>()),
  getAutomationRecord: mocks.getAutomationRecord,
  patchAutomationRecord: mocks.patchAutomationRecord,
}))

vi.mock("@/lib/automation-runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-runner")>()),
  previewAutomationRunPlan: mocks.previewAutomationRunPlan,
}))

import {
  getAutomationExperimentDimensions,
  runAutomationExperiment,
} from "@/lib/automation-experiment"

let savedRecord: AutomationRecord

describe("automation experiments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    savedRecord = configuredRecord()
    mocks.getAutomationRecord.mockResolvedValue(savedRecord)
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
            hookSubstitutions: { draw },
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

  it("returns current prompt fields without exposing schema internals to the UI", async () => {
    const result = await getAutomationExperimentDimensions("automation-id")
    const body = result.sections.find((section) => section.section === "body")

    expect(body).toMatchObject({
      slideCount: 3,
      textItems: [
        {
          itemId: "body-primary",
          label: "Primary copy",
          contentDirection: "Explain one practical lesson.",
          wordRange: { min: 5, max: 10, value: "5-10" },
          textMode: "prompt",
        },
        {
          itemId: "body-secondary",
          label: "Supporting copy",
          contentDirection: "Add a concrete example.",
          textMode: "prompt",
        },
      ],
      slides: [
        { slideIndex: 1, contentDirection: "Set up the problem." },
        { slideIndex: 2, contentDirection: "Show the original fix." },
        { slideIndex: 3, contentDirection: "" },
      ],
    })
    expect(result.tone.value).toBe(savedRecord.schema.tone.value)
    expect(result.promptFormatting).toEqual(
      savedRecord.schema.prompt_formatting
    )
    expect(result.enabledHookCount).toBe(2)
  })

  it("writes only the targeted slide direction override", async () => {
    const savedSnapshot = structuredClone(savedRecord.schema)

    await runAutomationExperiment({
      automationId: "automation-id",
      vary: [
        {
          dimension: "slideDirection",
          target: { section: "body", slideIndex: 2 },
          values: [
            "Explain the mistake with an example.",
            "Turn the lesson into a checklist.",
          ],
        },
      ],
      seed: 7,
    })

    expect(mocks.previewAutomationRunPlan).toHaveBeenCalledTimes(2)
    const firstSchema = previewSchema(0)
    const secondSchema = previewSchema(1)
    expect(directionAt(firstSchema, "body", 1)).toBe("Set up the problem.")
    expect(directionAt(firstSchema, "body", 2)).toBe(
      "Explain the mistake with an example."
    )
    expect(directionAt(secondSchema, "body", 1)).toBe("Set up the problem.")
    expect(directionAt(secondSchema, "body", 2)).toBe(
      "Turn the lesson into a checklist."
    )
    expect(automationFormatSection(firstSchema, "hook")).toEqual(
      automationFormatSection(savedSnapshot, "hook")
    )
    expect(automationFormatSection(firstSchema, "cta")).toEqual(
      automationFormatSection(savedSnapshot, "cta")
    )
    expect(savedRecord.schema).toEqual(savedSnapshot)
  })

  it("changes exactly one text item's content direction", async () => {
    await runAutomationExperiment({
      automationId: "automation-id",
      vary: [
        {
          dimension: "itemDirection",
          target: { section: "body", itemId: "body-secondary" },
          values: ["Use one specific before-and-after example."],
        },
      ],
      seed: 7,
    })

    const body = automationFormatSection(previewSchema(0), "content")
    expect(
      body.textItems.map((item) => ({
        id: item.id,
        contentDirection: item.contentDirection,
      }))
    ).toEqual([
      {
        id: "body-primary",
        contentDirection: "Explain one practical lesson.",
      },
      {
        id: "body-secondary",
        contentDirection: "Use one specific before-and-after example.",
      },
    ])
  })

  it("parses a word range into the target item's minimum and maximum", async () => {
    await runAutomationExperiment({
      automationId: "automation-id",
      vary: [
        {
          dimension: "wordRange",
          target: { section: "body", itemId: "body-primary" },
          values: ["20-40"],
        },
      ],
      seed: 7,
    })

    const body = automationFormatSection(previewSchema(0), "content")
    expect(body.textItems[0]).toMatchObject({
      id: "body-primary",
      wordLengthMin: 20,
      wordLengthMax: 40,
    })
    expect(body.textItems[1]).toMatchObject({
      id: "body-secondary",
      wordLengthMin: 8,
      wordLengthMax: 16,
    })
  })

  it("rejects malformed word ranges before previewing any cells", async () => {
    await expect(
      runAutomationExperiment({
        automationId: "automation-id",
        vary: [
          {
            dimension: "wordRange",
            target: { section: "body", itemId: "body-primary" },
            values: ["20 to 40"],
          },
        ],
      })
    ).rejects.toThrow('must use two positive integers like "20-40"')
    expect(mocks.previewAutomationRunPlan).not.toHaveBeenCalled()
  })

  it("uses deterministic seeded draws", async () => {
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

  it("records a failed cell and continues", async () => {
    mocks.previewAutomationRunPlan
      .mockRejectedValueOnce(new Error("Model unavailable"))
      .mockImplementationOnce(async (_schema, input) => ({
        status: "succeeded",
        plan: {
          hook: String(input.random?.()),
          slides: [],
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

  it("never writes or mutates the saved automation record", async () => {
    const savedSnapshot = structuredClone(savedRecord)

    await runAutomationExperiment({
      automationId: "automation-id",
      vary: [
        {
          dimension: "staticText",
          target: { section: "body", itemId: "body-primary" },
          values: ["Keep this exact copy.", "Use this other exact copy."],
        },
      ],
      seed: 7,
    })

    expect(mocks.patchAutomationRecord).not.toHaveBeenCalled()
    expect(savedRecord).toEqual(savedSnapshot)
    expect(
      automationFormatSection(previewSchema(0), "content").textItems[0]
    ).toMatchObject({
      textMode: "static",
      staticText: "Keep this exact copy.",
    })
  })
})

describe("holding everything but the varied field constant", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    savedRecord = configuredRecord()
    mocks.getAutomationRecord.mockResolvedValue(savedRecord)
  })

  it("gives every candidate of one repeat the same RNG stream", async () => {
    const streams: number[][] = []
    mocks.previewAutomationRunPlan.mockImplementation((async (
      _schema: unknown,
      options: { random?: () => number }
    ) => {
      streams.push([options.random!(), options.random!(), options.random!()])
      return {
        status: "succeeded",
        plan: { hook: "Selected hook", slides: [] },
      }
    }) as never)

    await runAutomationExperiment({
      automationId: "a1",
      vary: [
        {
          dimension: "slideDirection",
          target: { section: "body", slideIndex: 2 },
          values: ["Explain with an example.", "Write a checklist."],
        },
      ],
      seed: 7,
    })

    expect(streams).toHaveLength(2)
    // Same hook and image draws across the sweep: only the prompt field moved.
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
        plan: { hook: "Selected hook", slides: [] },
      }
    }) as never)

    await runAutomationExperiment({
      automationId: "a1",
      vary: [
        {
          dimension: "itemDirection",
          target: { section: "body", itemId: "body-primary" },
          values: ["Explain one lesson."],
        },
      ],
      repeats: 2,
      seed: 7,
    })

    expect(streams).toHaveLength(2)
    expect(streams[0]).not.toEqual(streams[1])
  })
})

function configuredRecord() {
  const record = createLocalAutomationRecord({ name: "Prompt field test" })
  record.schema.hooks = [
    {
      id: "hook-a",
      text: "Three ideas for this week",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "hook-b",
      text: "Try this practical fix",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]
  const body = automationFormatSection(record.schema, "content")
  const baseItem = body.textItems[0]
  record.schema = updateAutomationFormatSection(record.schema, "content", {
    slideCount: 3,
    slideOverrides: [
      { slideIndex: 1, contentDirection: "Set up the problem." },
      { slideIndex: 2, contentDirection: "Show the original fix." },
    ],
    textItems: [
      {
        ...baseItem,
        id: "body-primary",
        text: "Primary copy",
        contentDirection: "Explain one practical lesson.",
      },
      {
        ...baseItem,
        id: "body-secondary",
        text: "Supporting copy",
        contentDirection: "Add a concrete example.",
        wordLengthMin: 8,
        wordLengthMax: 16,
      },
    ],
  })
  return record
}

function previewSchema(index: number) {
  return mocks.previewAutomationRunPlan.mock.calls[index][0] as AutomationSchema
}

function directionAt(
  schema: AutomationSchema,
  section: "hook" | "body" | "cta",
  slideIndex: number
) {
  return automationFormatSection(
    schema,
    section === "body" ? "content" : section
  ).slideOverrides?.find((override) => override.slideIndex === slideIndex)
    ?.contentDirection
}

function draws(result: Awaited<ReturnType<typeof runAutomationExperiment>>) {
  return result.cells.map((cell) => cell.plan?.hookSubstitutions?.draw)
}
