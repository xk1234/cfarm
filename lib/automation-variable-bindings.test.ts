import { describe, expect, it } from "vitest"

import { deriveAutomationVariableBindings } from "@/lib/automation-variable-bindings"
import { createLocalAutomationRecord } from "@/lib/automations"
import type { WordCollectionRecord } from "@/lib/word-collections"

describe("automation variable bindings", () => {
  it("derives enabled hook tokens by collection variableName", () => {
    const automation = createLocalAutomationRecord()
    automation.schema.hooks = [
      hook("enabled", "[[ZODIAC]] needs [[SLIDE_COUNT]] reminders", true),
      hook("disabled", "[[MONTH]] is disabled", false),
    ]
    const report = deriveAutomationVariableBindings({
      schema: automation.schema,
      collections: [
        collection(
          "word-collection-0d218126-1234-4abc-9def-123456789abc",
          "Zodiac"
        ),
      ],
    })

    expect(report.hookSlots).toEqual({
      zodiac: "word-collection-0d218126-1234-4abc-9def-123456789abc",
    })
    expect(report.bindings).toEqual([
      expect.objectContaining({
        token: "[[ZODIAC]]",
        source: "derived",
        collectionId: "word-collection-0d218126-1234-4abc-9def-123456789abc",
      }),
      expect.objectContaining({
        token: "[[SLIDE_COUNT]]",
        source: "runtime",
      }),
    ])
    expect(report.missingTokens).toEqual([])
  })

  it("registers every seasonal runtime token without a collection", () => {
    const automation = createLocalAutomationRecord()
    automation.schema.hooks = [
      hook(
        "seasonal",
        "[[CURRENT_SIGN_CUSP]] [[CURRENT_SIGN]] [[CURRENT_MONTH]] [[NEXT_YEAR]]",
        true
      ),
    ]
    const report = deriveAutomationVariableBindings({
      schema: automation.schema,
      collections: [],
    })

    const seasonalTokens = [
      "[[CURRENT_SIGN_CUSP]]",
      "[[CURRENT_SIGN]]",
      "[[CURRENT_MONTH]]",
      "[[NEXT_YEAR]]",
    ]
    expect(report.bindings).toEqual(
      seasonalTokens.map((token) =>
        expect.objectContaining({ token, source: "runtime" })
      )
    )
    expect(report.runtimeVariables).toEqual(
      expect.arrayContaining(
        seasonalTokens.map((token) =>
          expect.objectContaining({ token, source: "runtime" })
        )
      )
    )
    expect(report.missingTokens).toEqual([])
  })

  it("uses explicit hook slots only as overrides and reports stale entries", () => {
    const automation = createLocalAutomationRecord()
    automation.schema.hooks = [hook("one", "[[SIGN]] compatibility", true)]
    automation.schema.hook_slots = {
      SIGN: "zodiac",
      unused: "number",
    }
    const report = deriveAutomationVariableBindings({
      schema: automation.schema,
      collections: [
        collection("zodiac", "Zodiac"),
        collection("number", "Number"),
      ],
    })

    expect(report.hookSlots).toEqual({ sign: "zodiac" })
    expect(report.bindings[0]).toMatchObject({
      variableName: "sign",
      source: "override",
      collectionId: "zodiac",
    })
    expect(report.unusedOverrides).toEqual(["unused"])
  })

  it("reports unresolved and ambiguous variables instead of choosing silently", () => {
    const automation = createLocalAutomationRecord()
    automation.schema.hooks = [hook("one", "[[CITY]] versus [[PRODUCT]]", true)]
    const report = deriveAutomationVariableBindings({
      schema: automation.schema,
      collections: [
        collection(
          "word-collection-11111111-1111-4111-8111-111111111111",
          "City"
        ),
        collection(
          "word-collection-22222222-2222-4222-8222-222222222222",
          "City"
        ),
      ],
    })

    expect(report.missingTokens).toEqual(["[[CITY]]", "[[PRODUCT]]"])
    expect(report.conflicts).toEqual([
      {
        variableName: "city",
        collectionIds: [
          "word-collection-11111111-1111-4111-8111-111111111111",
          "word-collection-22222222-2222-4222-8222-222222222222",
        ],
      },
    ])
  })
})

function hook(id: string, text: string, enabled: boolean) {
  return { id, text, enabled, createdAt: "2026-07-24T00:00:00.000Z" }
}

function collection(id: string, name: string): WordCollectionRecord {
  return {
    id,
    name,
    words: ["one"],
    source: "manual",
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  }
}
