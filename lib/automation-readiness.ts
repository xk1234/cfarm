import { expandHook } from "@/lib/hook-expansion"
import type { StoredImageCollection } from "@/lib/image-collections"
import {
  automationCollectionIds,
  automationFormatSection,
  automationHooks,
  ugcLiveConfigurationErrors,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  collectionAliases,
  storedToCollection,
} from "@/lib/realfarm-collections"
import type { WordCollectionRecord } from "@/lib/word-collections"

export type AutomationCollectionInventoryItem = {
  id: string
  name: string
  aliases: string[]
  assetCount: number
  mediaType?: "image" | "video"
}

export type AutomationGenerationBlocker = {
  code:
    | "unsupported_runner"
    | "missing_hook"
    | "missing_collection_selection"
    | "missing_collection"
    | "empty_collection"
    | "invalid_hook_variable"
    | "invalid_ugc_configuration"
  message: string
}

export function automationCollectionInventory(
  collections: StoredImageCollection[]
): AutomationCollectionInventoryItem[] {
  return collections.map((collection) => {
    const created = storedToCollection(collection)
    return {
      id: created.id,
      name: created.title,
      aliases: collectionAliases(created),
      assetCount: created.images.length,
      mediaType: created.mediaType,
    }
  })
}

export function automationGenerationBlockers(input: {
  schema: AutomationSchema
  collections: AutomationCollectionInventoryItem[]
  wordCollections: WordCollectionRecord[]
}): AutomationGenerationBlocker[] {
  const { schema } = input

  if (schema.automationKind === "video") {
    return [
      {
        code: "unsupported_runner",
        message: "Saved video automations do not have a generation runner yet.",
      },
    ]
  }

  if (schema.automationKind === "ugc") {
    return ugcLiveConfigurationErrors("live", schema).map((message) => ({
      code: "invalid_ugc_configuration" as const,
      message,
    }))
  }

  const blockers: AutomationGenerationBlocker[] = []
  const hooks = automationHooks(schema)

  const primaryCollectionIds = automationCollectionIds(schema)
  if (primaryCollectionIds.length === 0) {
    blockers.push({
      code: "missing_collection_selection",
      message: "Select an image collection.",
    })
  }

  for (const collectionId of referencedCollectionIds(schema)) {
    const collection = input.collections.find((candidate) =>
      candidate.aliases.includes(collectionId)
    )
    if (!collection) {
      blockers.push({
        code: "missing_collection",
        message: `Collection “${collectionId}” does not exist.`,
      })
    } else if (
      collection.mediaType === "video" ||
      collection.assetCount === 0
    ) {
      blockers.push({
        code: "empty_collection",
        message: `Collection “${collection.name}” has no usable images.`,
      })
    }
  }

  const contentSection = automationFormatSection(schema, "content")
  const validationSlideCount =
    contentSection.slideCountMode === "varying"
      ? Math.max(
          1,
          Math.round(contentSection.slideCountMin ?? contentSection.slideCount)
        )
      : Math.max(1, Math.round(contentSection.slideCount))
  const invalidHookMessages: string[] = []
  let usableHookCount = 0
  for (const hook of hooks) {
    try {
      expandHook(hook, schema.hook_slots, input.wordCollections, () => 0, {
        noDuplicates: schema.hook_no_duplicate_slots === true,
        caseMode: schema.prompt_formatting.hook_case,
        timeZone: schema.schedule.timezone,
        // Readiness only needs a valid representative value. The runner
        // resolves SLIDE_COUNT again after selecting the actual static/varying
        // body count for this run.
        slideCount: validationSlideCount,
      })
      usableHookCount += 1
    } catch (error) {
      invalidHookMessages.push(
        error instanceof Error
          ? error.message
          : "A hook variable cannot be expanded."
      )
    }
  }
  // A malformed hook is isolated to that hook. It becomes an automation-level
  // blocker only when the enabled pool has no usable hook left.
  if (hooks.length > 0 && usableHookCount === 0) {
    blockers.push(
      ...invalidHookMessages.map((message) => ({
        code: "invalid_hook_variable" as const,
        message,
      }))
    )
  }

  return uniqueBlockers(blockers)
}

function referencedCollectionIds(schema: AutomationSchema) {
  const ids = new Set(automationCollectionIds(schema))

  for (const route of schema.content_strategy?.routes ?? []) {
    for (const collectionId of route.collection_ids) {
      if (collectionId) ids.add(collectionId)
    }
  }

  for (const section of schema.formatting) {
    if (section.overlayImage?.enabled && section.overlayImage.collectionId) {
      ids.add(section.overlayImage.collectionId)
    }
    for (const imageItem of section.imageItems ?? []) {
      if (imageItem.collectionId) ids.add(imageItem.collectionId)
    }
  }
  for (const design of schema.slide_designs) {
    if (design.overlayImage?.enabled && design.overlayImage.collectionId) {
      ids.add(design.overlayImage.collectionId)
    }
    for (const imageItem of design.imageItems ?? []) {
      if (imageItem.collectionId) ids.add(imageItem.collectionId)
    }
  }

  return [...ids]
}

function uniqueBlockers(blockers: AutomationGenerationBlocker[]) {
  const seen = new Set<string>()
  return blockers.filter((blocker) => {
    const key = `${blocker.code}:${blocker.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
