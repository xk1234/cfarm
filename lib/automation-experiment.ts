import { randomUUID } from "node:crypto"

import {
  validateAutomationRunOutput,
  type AutomationOutputQaReport,
} from "@/lib/automation-output-qa"
import { previewAutomationRunPlan } from "@/lib/automation-runner"
import { getAutomationRecord } from "@/lib/automations"
import {
  automationFormatSection,
  automationHookItems,
  automationTone,
  schemaWithAutomationHookItems,
  schemaWithAutomationTone,
  updateAutomationFormatSection,
  type AutomationFormatSectionId,
  type AutomationSchema,
} from "@/lib/realfarm-automation"

export const AUTOMATION_EXPERIMENT_CELL_CAP = 200

export type AutomationExperimentDimension =
  | "slideDirection"
  | "itemDirection"
  | "wordRange"
  | "staticText"
  | "tone"
  | "promptFormatting"
  | "slideCount"
  | "model"
  | "hook"

type SectionTarget = { section: AutomationFormatSectionId }
type SlideTarget = SectionTarget & { slideIndex: number }
type ItemTarget = SectionTarget & { itemId: string }

export type AutomationExperimentVariation =
  | {
      dimension: "slideDirection"
      target: SlideTarget
      values: string[]
    }
  | {
      dimension: "itemDirection" | "wordRange" | "staticText"
      target: ItemTarget
      values: string[]
    }
  | {
      dimension: "slideCount"
      target: SectionTarget
      values: string[]
    }
  | {
      dimension: Extract<
        AutomationExperimentDimension,
        "tone" | "promptFormatting" | "model" | "hook"
      >
      target?: never
      values: string[]
    }

export type AutomationExperimentInput = {
  automationId: string
  vary: AutomationExperimentVariation[]
  allHooks?: boolean
  repeats?: number
  seed?: number
}

export type AutomationExperimentVariant = Record<string, string>

export type AutomationExperimentCell = {
  cellId: string
  variant: AutomationExperimentVariant
  plan?: Awaited<ReturnType<typeof previewAutomationRunPlan>>["plan"]
  qa?: AutomationOutputQaReport
  error?: string
}

export async function getAutomationExperimentDimensions(automationId: string) {
  const automation = await getAutomationRecord(automationId)
  if (!automation) throw new Error("Automation not found")
  if (automation.schema.automationKind !== "slideshow") {
    throw new Error("Only saved slideshow automations can be tested")
  }

  return {
    automationId,
    sections: (["hook", "body", "cta"] as const).map((sectionId) => {
      const section = automationFormatSection(
        automation.schema,
        sectionRole(sectionId)
      )
      return {
        section: sectionId,
        slideCount: section.slideCount,
        textItems: section.textItems.map((item, index) => ({
          itemId: item.id,
          label: textItemLabel(item.text, index),
          contentDirection: item.contentDirection,
          wordRange: {
            min: item.wordLengthMin,
            max: item.wordLengthMax,
            value: `${item.wordLengthMin}-${item.wordLengthMax}`,
          },
          textMode: item.textMode,
          staticText: item.staticText,
        })),
        slides: Array.from({ length: section.slideCount }, (_, index) => {
          const slideIndex = index + 1
          return {
            slideIndex,
            contentDirection:
              section.slideOverrides?.find(
                (override) => override.slideIndex === slideIndex
              )?.contentDirection ?? "",
          }
        }),
      }
    }),
    tone: {
      ...automation.schema.tone,
      value: automationTone(automation.schema),
    },
    promptFormatting: {
      ...automation.schema.prompt_formatting,
    },
    enabledHookCount: automationHookItems(automation.schema).filter(
      (hook) => hook.enabled
    ).length,
  }
}

export async function runAutomationExperiment(
  input: AutomationExperimentInput
) {
  const automationId = input.automationId.trim()
  if (!automationId) throw new Error("Automation is required")
  const repeats = input.repeats ?? 1
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
    throw new Error("Repeats must be an integer between 1 and 20")
  }
  const seed = normalizeSeed(input.seed ?? Date.now())
  const automation = await getAutomationRecord(automationId)
  if (!automation) throw new Error("Automation not found")
  if (automation.schema.automationKind !== "slideshow") {
    throw new Error("Only saved slideshow automations can be tested")
  }

  const dimensions = normalizeVariations(
    automation.schema,
    input.vary,
    input.allHooks
  )
  validateVariations(automation.schema, dimensions)
  const variants = cartesianVariants(dimensions)
  const cellCount = variants.length * repeats
  if (cellCount > AUTOMATION_EXPERIMENT_CELL_CAP) {
    throw new Error(
      `Experiment has ${cellCount} cells, above the synchronous cap of ${AUTOMATION_EXPERIMENT_CELL_CAP}; reduce variations or repeats because every cell makes real model calls.`
    )
  }

  const experimentId = `automation-experiment-${randomUUID()}`
  const cells: AutomationExperimentCell[] = []
  for (let index = 0; index < cellCount; index += 1) {
    const variant = variants[Math.floor(index / repeats)] ?? {}
    const repeatedVariant =
      repeats > 1
        ? { ...variant, repeat: String((index % repeats) + 1) }
        : variant
    const cellId = `${experimentId}-cell-${index + 1}`
    try {
      const { schema, textModel } = applyVariant(
        automation.schema,
        dimensions,
        variant
      )
      // Seed by REPEAT, not by cell. Every cell of the same repeat must share
      // one RNG stream so the hook and image draws are identical and the only
      // thing that moved is the varied dimension — seeding per cell made each
      // cell draw a different hook, which is exactly the confound this feature
      // exists to remove. Separate repeats still get their own stream, which is
      // what makes repeats measure variance.
      const preview = await previewAutomationRunPlan(schema, {
        automationId,
        textModel,
        includeTextGenerationResult: true,
        random: mulberry32(normalizeSeed(seed + (index % repeats))),
      })
      const plan = preview.plan
      const qa = validateAutomationRunOutput({
        schema,
        run: {
          id: cellId,
          automationId,
          automationTitle: automation.name,
          scheduledFor: new Date(0).toISOString(),
          status: preview.status,
          plan,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          error: preview.error,
        },
      })
      cells.push({
        cellId,
        variant: repeatedVariant,
        plan,
        qa,
        ...(preview.error ? { error: preview.error } : {}),
      })
    } catch (error) {
      cells.push({
        cellId,
        variant: repeatedVariant,
        error:
          error instanceof Error ? error.message : "Experiment cell failed",
      })
    }
  }

  return { experimentId, automationId, seed, cells }
}

function normalizeVariations(
  schema: AutomationSchema,
  requested: AutomationExperimentVariation[],
  allHooks = false
) {
  const variations = requested.map((variation) => ({
    ...variation,
    values: [...new Set(variation.values.map((value) => value.trim()))].filter(
      Boolean
    ),
  })) as AutomationExperimentVariation[]
  if (variations.some((variation) => variation.values.length === 0)) {
    throw new Error("Every varied dimension requires at least one value")
  }
  if (allHooks && !variations.some((item) => item.dimension === "hook")) {
    variations.unshift({
      dimension: "hook",
      values: automationHookItems(schema)
        .filter((hook) => hook.enabled)
        .map((hook) => hook.id),
    })
  }
  return variations
}

function validateVariations(
  schema: AutomationSchema,
  variations: AutomationExperimentVariation[]
) {
  for (const variation of variations) {
    if (
      variation.dimension === "tone" ||
      variation.dimension === "promptFormatting" ||
      variation.dimension === "model" ||
      variation.dimension === "hook"
    ) {
      continue
    }
    if (!variation.target) {
      throw new Error(`${variation.dimension} requires a target`)
    }

    const section = automationFormatSection(
      schema,
      sectionRole(variation.target.section)
    )
    if (variation.dimension === "slideDirection") {
      if (
        !Number.isInteger(variation.target.slideIndex) ||
        variation.target.slideIndex < 1 ||
        variation.target.slideIndex > section.slideCount
      ) {
        throw new Error(
          `Slide ${variation.target.slideIndex} is outside the ${variation.target.section} section`
        )
      }
    } else if (
      variation.dimension === "itemDirection" ||
      variation.dimension === "wordRange" ||
      variation.dimension === "staticText"
    ) {
      if (
        !section.textItems.some((item) => item.id === variation.target.itemId)
      ) {
        throw new Error(
          `Text item ${variation.target.itemId} was not found in the ${variation.target.section} section`
        )
      }
    }

    if (variation.dimension === "wordRange") {
      variation.values.forEach(parseWordRange)
    }
    if (variation.dimension === "slideCount") {
      variation.values.forEach(parseSlideCount)
    }
  }
}

function cartesianVariants(variations: AutomationExperimentVariation[]) {
  return variations.reduce<AutomationExperimentVariant[]>(
    (variants, variation) =>
      variants.flatMap((variant) =>
        variation.values.map((value) => ({
          ...variant,
          [variantKey(variation)]: value,
        }))
      ),
    [{}]
  )
}

function variantKey(variation: AutomationExperimentVariation) {
  if (variation.dimension === "slideDirection") {
    return `${variation.dimension}:${variation.target.section}:${variation.target.slideIndex}`
  }
  if (
    variation.dimension === "itemDirection" ||
    variation.dimension === "wordRange" ||
    variation.dimension === "staticText"
  ) {
    return `${variation.dimension}:${variation.target.section}:${variation.target.itemId}`
  }
  if (variation.dimension === "slideCount") {
    return `${variation.dimension}:${variation.target.section}`
  }
  return variation.dimension
}

function applyVariant(
  sourceSchema: AutomationSchema,
  variations: AutomationExperimentVariation[],
  variant: AutomationExperimentVariant
) {
  let schema = structuredClone(sourceSchema)
  let textModel: string | undefined
  for (const variation of variations) {
    const value = variant[variantKey(variation)]
    if (!value) continue
    if (variation.dimension === "hook") {
      const hooks = automationHookItems(schema)
      const selected = hooks.find(
        (hook) => hook.id === value || hook.text === value
      )
      if (!selected) throw new Error(`Hook variation ${value} was not found`)
      schema = schemaWithAutomationHookItems(
        schema,
        hooks.map((hook) => ({ ...hook, enabled: hook.id === selected.id }))
      )
    } else if (variation.dimension === "slideDirection") {
      const section = automationFormatSection(
        schema,
        sectionRole(variation.target.section)
      )
      schema = updateAutomationFormatSection(
        schema,
        sectionRole(variation.target.section),
        {
          slideOverrides: [
            ...(section.slideOverrides ?? []).filter(
              (override) => override.slideIndex !== variation.target.slideIndex
            ),
            {
              slideIndex: variation.target.slideIndex,
              contentDirection: value,
            },
          ],
        }
      )
    } else if (
      variation.dimension === "itemDirection" ||
      variation.dimension === "wordRange" ||
      variation.dimension === "staticText"
    ) {
      const role = sectionRole(variation.target.section)
      const section = automationFormatSection(schema, role)
      const range =
        variation.dimension === "wordRange" ? parseWordRange(value) : undefined
      schema = updateAutomationFormatSection(schema, role, {
        textItems: section.textItems.map((item) => {
          if (item.id !== variation.target.itemId) return item
          if (variation.dimension === "itemDirection") {
            return { ...item, contentDirection: value }
          }
          if (variation.dimension === "staticText") {
            return { ...item, staticText: value, textMode: "static" }
          }
          return {
            ...item,
            wordLengthMin: range!.min,
            wordLengthMax: range!.max,
          }
        }),
      })
    } else if (variation.dimension === "tone") {
      schema = schemaWithAutomationTone(schema, value)
    } else if (variation.dimension === "promptFormatting") {
      schema = {
        ...schema,
        prompt_formatting: {
          ...schema.prompt_formatting,
          style: value,
        },
      }
    } else if (variation.dimension === "slideCount") {
      schema = updateAutomationFormatSection(
        schema,
        sectionRole(variation.target.section),
        { slideCount: parseSlideCount(value) }
      )
    } else if (variation.dimension === "model") {
      textModel = value
    }
  }
  return { schema, textModel }
}

function sectionRole(section: AutomationFormatSectionId) {
  return section === "body" ? ("content" as const) : section
}

function textItemLabel(text: string, index: number) {
  const value = text.trim()
  if (!value) return `Text item ${index + 1}`
  return value.length > 60 ? `${value.slice(0, 57)}...` : value
}

function parseWordRange(value: string) {
  const match = /^([1-9]\d*)-([1-9]\d*)$/.exec(value)
  if (!match) {
    throw new Error(
      `Word range "${value}" must use two positive integers like "20-40"`
    )
  }
  const min = Number(match[1])
  const max = Number(match[2])
  if (min > max) {
    throw new Error(
      `Word range "${value}" must have a minimum no greater than its maximum`
    )
  }
  return { min, max }
}

function parseSlideCount(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Slide count "${value}" must be a non-negative integer string`
    )
  }
  return Number(value)
}

function normalizeSeed(seed: number) {
  if (!Number.isFinite(seed)) throw new Error("Seed must be a finite number")
  return Math.trunc(seed) >>> 0
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
