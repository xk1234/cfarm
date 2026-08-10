import { hookUsesDynamicSlideCount } from "@/lib/fixed-slideshow-count"
import type { AutomationHookItem } from "@/lib/realfarm-automation"

type JsonRecord = Record<string, unknown>

export type FixedSlideCountMigrationResult = {
  record: JsonRecord
  changed: boolean
  fixedSlideCount: number
  disabledHookIds: string[]
  deletedHookIds: string[]
}

export function migrateTemplateToFixedSlideCount(input: {
  record: JsonRecord
  publishedHookIds: ReadonlySet<string>
  now: string
}): FixedSlideCountMigrationResult {
  const schema = object(input.record.schema)
  const promptFormatting = object(schema.prompt_formatting)
  const formatting = Array.isArray(schema.formatting)
    ? schema.formatting.map((value) => object(value))
    : []
  const configured = Number(promptFormatting.num_of_slides)
  const formattingTotal = formatting.reduce(
    (sum, block) =>
      sum + Math.max(0, Math.round(Number(block.slideCount) || 0)),
    0
  )
  const fixedSlideCount = Math.max(
    1,
    Math.round(
      Number.isFinite(configured) && configured > 0
        ? configured
        : formattingTotal || 1
    )
  )

  const disabledHookIds: string[] = []
  const deletedHookIds: string[] = []
  const hooks = Array.isArray(schema.hooks)
    ? schema.hooks.flatMap((value) => {
        const hook = object(value) as unknown as AutomationHookItem
        if (!hook.id || !hook.text || !hookUsesDynamicSlideCount(hook)) {
          return [object(value)]
        }
        if (!input.publishedHookIds.has(hook.id)) {
          deletedHookIds.push(hook.id)
          return []
        }
        if (hook.enabled !== false) disabledHookIds.push(hook.id)
        return [
          {
            ...object(value),
            enabled: false,
            updatedAt: input.now,
          },
        ]
      })
    : []

  const nextFormatting = formatting.map((block) => {
    const next: JsonRecord = { ...block, slideCountMode: "static" }
    delete next.slideCountMin
    delete next.slideCountMax
    return next
  })
  const nextRecord = {
    ...input.record,
    updatedAt: input.now,
    schema: {
      ...schema,
      prompt_formatting: {
        ...promptFormatting,
        num_of_slides: fixedSlideCount,
        slide_count_min: fixedSlideCount,
        slide_count_max: fixedSlideCount,
      },
      formatting: nextFormatting,
      hooks,
    },
  }
  const changed =
    JSON.stringify(stripMigrationTimestamp(input.record)) !==
    JSON.stringify(stripMigrationTimestamp(nextRecord))

  return {
    record: changed ? nextRecord : input.record,
    changed,
    fixedSlideCount,
    disabledHookIds,
    deletedHookIds,
  }
}

function stripMigrationTimestamp(value: JsonRecord) {
  const copy = structuredClone(value)
  delete copy.updatedAt
  const schema = object(copy.schema)
  copy.schema = schema
  if (Array.isArray(schema.hooks)) {
    schema.hooks = schema.hooks.map((value) => {
      const hook = object(value)
      if (hookUsesDynamicSlideCount(hook as unknown as AutomationHookItem)) {
        delete hook.updatedAt
      }
      return hook
    })
  }
  return copy
}

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonRecord) }
    : {}
}
