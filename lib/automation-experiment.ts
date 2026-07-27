import { randomUUID } from "node:crypto"

import {
  validateAutomationRunOutput,
  type AutomationOutputQaReport,
} from "@/lib/automation-output-qa"
import { previewAutomationRunPlan } from "@/lib/automation-runner"
import { deriveAutomationVariableBindings } from "@/lib/automation-variable-bindings"
import { getAutomationRecord } from "@/lib/automations"
import {
  hookVariableNameFromLabel,
  isRuntimeHookVariable,
  runtimeHookVariables,
} from "@/lib/hook-variables"
import {
  automationHookItems,
  automationTonePresetOptions,
  schemaWithAutomationCollectionId,
  schemaWithAutomationHookItems,
  schemaWithAutomationContentDirection,
  schemaWithAutomationTone,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  defaultSlideshowTextModel,
  featuredOpenRouterModelIds,
} from "@/lib/realfarm-generation-model-registry"
import {
  listWordCollections,
  type WordCollectionRecord,
} from "@/lib/word-collections"

export const AUTOMATION_EXPERIMENT_CELL_CAP = 200

export type AutomationExperimentDimension =
  "hook" | "variable" | "tone" | "model" | "collection" | "contentDirection"

export type AutomationExperimentVariation = {
  dimension: AutomationExperimentDimension
  name?: string
  values: string[]
}

export type AutomationExperimentAvailableDimension = {
  dimension: "contentDirection" | "tone" | "model"
  name?: string
  label: string
  currentValue: string
  sampleValues: string[]
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
  /** Non-fatal notes, e.g. a swept variable the drawn hook never uses. */
  warnings?: string[]
  error?: string
}

export async function getAutomationExperimentDimensions(automationId: string) {
  const [automation, collections] = await Promise.all([
    getAutomationRecord(automationId),
    listWordCollections(),
  ])
  if (!automation) throw new Error("Automation not found")
  if (automation.schema.automationKind !== "slideshow") {
    throw new Error("Only saved slideshow automations can be tested")
  }

  const bindings = deriveAutomationVariableBindings({
    schema: automation.schema,
    collections,
  })
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection])
  )

  return {
    automationId,
    automationDimensions: [
      ...automation.schema.formatting.map(
        (block): AutomationExperimentAvailableDimension => ({
          dimension: "contentDirection",
          name: block.id,
          label: `${formattingBlockLabel(block.id)} content direction`,
          currentValue:
            block.textItems.find((item) => item.contentDirection.trim())
              ?.contentDirection ?? "",
          sampleValues: [],
        })
      ),
      {
        dimension: "tone",
        label: "Tone",
        currentValue: automation.schema.tone.value,
        sampleValues: [...automationTonePresetOptions],
      },
      {
        dimension: "model",
        label: "Model",
        currentValue: defaultSlideshowTextModel,
        sampleValues: [
          ...new Set([
            defaultSlideshowTextModel,
            ...featuredOpenRouterModelIds,
          ]),
        ],
      },
    ],
    variables: bindings.bindings
      .filter((binding) => binding.source !== "runtime")
      .map((binding) => ({
        ...binding,
        sweepable: binding.source !== "missing",
        reason:
          binding.source === "missing"
            ? "No single word collection is bound to this variable."
            : undefined,
        sampleValues: binding.collectionId
          ? (collectionsById.get(binding.collectionId)?.words.slice(0, 12) ??
            [])
          : [],
      })),
    fixed: runtimeHookVariables.map((variable) => ({
      ...variable,
      token: `[[${variable.name.toUpperCase()}]]`,
      source: "runtime" as const,
      sweepable: false,
      reason:
        "Runtime variables are resolved from the run context and are fixed.",
    })),
    enabledHookCount: automationHookItems(automation.schema).filter(
      (hook) => hook.enabled
    ).length,
  }
}

function formattingBlockLabel(blockId: string) {
  if (blockId === "cta") return "CTA"
  return `${blockId.charAt(0).toUpperCase()}${blockId.slice(1)}`
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
  const [automation, collections] = await Promise.all([
    getAutomationRecord(automationId),
    listWordCollections(),
  ])
  if (!automation) throw new Error("Automation not found")
  if (automation.schema.automationKind !== "slideshow") {
    throw new Error("Only saved slideshow automations can be tested")
  }

  const dimensions = normalizeVariations(
    automation.schema,
    input.vary,
    input.allHooks
  )
  assertSweepableVariables(automation.schema, collections, dimensions)
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
      const { schema, textModel, substitutions } = applyVariant(
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
      const plan = {
        ...preview.plan,
        hookSubstitutions: {
          ...(preview.plan.hookSubstitutions ?? {}),
          ...substitutions,
        },
      }
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
      // A varied variable only reaches the output when the drawn hook actually
      // contains its token. Without this the cell looks like a clean success
      // while the swept value changed nothing at all.
      const inertVariables = dimensions
        .filter((variation) => variation.dimension === "variable")
        .map((variation) => hookVariableNameFromLabel(variation.name))
        .filter(
          (name): name is string =>
            Boolean(name) &&
            !new RegExp(`\\[\\[\\s*${name}\\s*\\]\\]`, "i").test(
              plan.hookTemplate ?? plan.hook ?? ""
            )
        )
      cells.push({
        cellId,
        variant: repeatedVariant,
        plan,
        qa,
        ...(inertVariables.length
          ? {
              warnings: inertVariables.map(
                (name) =>
                  `The drawn hook does not use [[${name.toUpperCase()}]], so varying it changed nothing in this cell.`
              ),
            }
          : {}),
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
    name: variation.name?.trim() || undefined,
    values: [...new Set(variation.values.map((value) => value.trim()))].filter(
      Boolean
    ),
  }))
  if (variations.some((variation) => variation.values.length === 0)) {
    throw new Error("Every varied dimension requires at least one value")
  }
  if (allHooks && !variations.some((item) => item.dimension === "hook")) {
    variations.unshift({
      dimension: "hook",
      name: undefined,
      values: automationHookItems(schema)
        .filter((hook) => hook.enabled)
        .map((hook) => hook.id),
    })
  }
  return variations
}

function assertSweepableVariables(
  schema: AutomationSchema,
  collections: WordCollectionRecord[],
  variations: AutomationExperimentVariation[]
) {
  const bindings = deriveAutomationVariableBindings({ schema, collections })
  for (const variation of variations) {
    if (variation.dimension !== "variable") continue
    const name = hookVariableNameFromLabel(variation.name)
    if (!name) {
      throw new Error("Variable dimensions require a name")
    }
    if (isRuntimeHookVariable(name)) {
      throw new Error(
        `Runtime variable ${name} is fixed and cannot be swept; it is resolved from the run context.`
      )
    }
    const binding = bindings.bindings.find(
      (candidate) => candidate.variableName === name
    )
    if (!binding) {
      throw new Error(`Variable ${name} is not used by this automation`)
    }
    if (binding.source === "missing") {
      throw new Error(
        `Variable ${name} cannot be swept because no single collection is bound to it.`
      )
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
  if (variation.dimension === "variable") {
    return `variable:${hookVariableNameFromLabel(variation.name)}`
  }
  // Keyed by block so a sweep can vary the body and CTA directions at once
  // without the two collapsing into one column.
  if (variation.dimension === "contentDirection") {
    return `contentDirection:${blockIdForVariation(variation)}`
  }
  return variation.dimension
}

/** Which formatting block a contentDirection variation targets. */
function blockIdForVariation(variation: AutomationExperimentVariation) {
  return (variation.name ?? "").trim() || "body"
}

function applyVariant(
  sourceSchema: AutomationSchema,
  variations: AutomationExperimentVariation[],
  variant: AutomationExperimentVariant
) {
  let schema = structuredClone(sourceSchema)
  let textModel: string | undefined
  const substitutions: Record<string, string> = {}
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
    } else if (variation.dimension === "variable") {
      const name = hookVariableNameFromLabel(variation.name)
      substitutions[name] = value
      const tokenPattern = new RegExp(
        `\\[\\[${escapeRegExp(name)}\\]\\]|\\{${escapeRegExp(name)}\\}`,
        "gi"
      )
      schema = schemaWithAutomationHookItems(
        schema,
        automationHookItems(schema).map((hook) => ({
          ...hook,
          text: hook.text.replace(tokenPattern, () => value),
        }))
      )
    } else if (variation.dimension === "tone") {
      schema = schemaWithAutomationTone(schema, value)
    } else if (variation.dimension === "model") {
      textModel = value
    } else if (variation.dimension === "contentDirection") {
      // `name` selects the block (hook / body / cta). Only that block's
      // direction changes, so the cell isolates the instruction being tested.
      schema = schemaWithAutomationContentDirection(
        schema,
        blockIdForVariation(variation),
        value
      )
    } else if (variation.dimension === "collection") {
      schema = schemaWithAutomationCollectionId(schema, "hook", value)
      schema = schemaWithAutomationCollectionId(schema, "content", value)
      schema = schemaWithAutomationCollectionId(schema, "cta", value)
    }
  }
  return { schema, textModel, substitutions }
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
