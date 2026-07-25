import { describe, expect, it } from "vitest"

import {
  automationGenerationBlockers,
  type AutomationCollectionInventoryItem,
} from "@/lib/automation-readiness"
import {
  defaultAutomationSchema,
  schemaWithAutomationHookItems,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const automation: Automation = {
  id: "automation-readiness",
  name: "Readiness",
  status: "live",
  account: "No social account",
  handle: "",
  times: [],
  favorite: false,
  theme: "ugc",
  socialIntegrations: [],
}

const availableCollection: AutomationCollectionInventoryItem = {
  id: "daily-scenes",
  name: "Daily scenes",
  aliases: ["daily-scenes", "Daily scenes"],
  assetCount: 12,
  mediaType: "image",
}

function configuredSchema(): AutomationSchema {
  const schema = schemaWithAutomationHookItems(
    defaultAutomationSchema(automation),
    [
      {
        id: "hook-1",
        text: "Three ways to improve your room",
        enabled: true,
        createdAt: "2026-07-24T00:00:00.000Z",
      },
    ]
  )
  return {
    ...schema,
    image_collection_ids: {
      ...schema.image_collection_ids,
      first_slide: {
        ...schema.image_collection_ids.first_slide,
        collection: "daily-scenes",
      },
      all_slides: "daily-scenes",
    },
  }
}

describe("automation generation readiness", () => {
  it("accepts a slideshow with a usable hook and populated collection", () => {
    expect(
      automationGenerationBlockers({
        schema: configuredSchema(),
        collections: [availableCollection],
        wordCollections: [],
      })
    ).toEqual([])
  })

  it("accepts SLIDE_COUNT as a runtime variable without a word collection", () => {
    const schema = schemaWithAutomationHookItems(configuredSchema(), [
      {
        id: "count-hook",
        text: "[[SLIDE_COUNT]] ways to improve your room",
        enabled: true,
        createdAt: "2026-07-24T00:00:00.000Z",
      },
    ])

    expect(
      automationGenerationBlockers({
        schema,
        collections: [availableCollection],
        wordCollections: [],
      })
    ).toEqual([])
  })

  it("isolates an invalid variable to its hook when another hook is usable", () => {
    const schema = schemaWithAutomationHookItems(configuredSchema(), [
      {
        id: "broken-hook",
        text: "Best ideas for [[MISSING]]",
        enabled: true,
        createdAt: "2026-07-24T00:00:00.000Z",
      },
      {
        id: "usable-hook",
        text: "[[SLIDE_COUNT]] practical room ideas",
        enabled: true,
        createdAt: "2026-07-24T00:00:00.000Z",
      },
    ])

    expect(
      automationGenerationBlockers({
        schema,
        collections: [availableCollection],
        wordCollections: [],
      })
    ).toEqual([])
  })

  it("reports a referenced collection that no longer exists", () => {
    expect(
      automationGenerationBlockers({
        schema: configuredSchema(),
        collections: [],
        wordCollections: [],
      })
    ).toContainEqual({
      code: "missing_collection",
      message: "Collection “daily-scenes” does not exist.",
    })
  })

  it("reports empty collections and broken hook variables", () => {
    const schema = schemaWithAutomationHookItems(configuredSchema(), [
      {
        id: "hook-variable",
        text: "Best ideas for [[room_type]]",
        enabled: true,
        createdAt: "2026-07-24T00:00:00.000Z",
      },
    ])
    schema.hook_slots = { room_type: "room-types" }

    expect(
      automationGenerationBlockers({
        schema,
        collections: [{ ...availableCollection, assetCount: 0 }],
        wordCollections: [],
      }).map((blocker) => blocker.code)
    ).toEqual(["empty_collection", "invalid_hook_variable"])
  })
})
