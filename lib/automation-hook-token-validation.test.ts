import { describe, expect, it } from "vitest"

import {
  assertValidAutomationHookTokens,
  validateAutomationHookTokens,
} from "@/lib/automation-hook-token-validation"
import type { WordCollectionRecord } from "@/lib/word-collections"

const collections: WordCollectionRecord[] = [
  {
    id: "zodiac",
    name: "Zodiac signs",
    words: ["aries", "taurus"],
    source: "manual",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "number",
    name: "number",
    words: ["3", "5"],
    source: "manual",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "trait",
    name: "trait",
    words: ["clean", "graceful"],
    source: "manual",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
]

describe("automation hook token validation", () => {
  it("accepts canonical collection and runtime tokens", () => {
    expect(
      validateAutomationHookTokens({
        hooks: [
          {
            text: "[[SLIDE_COUNT]] things [[ZODIAC]] needs in [[CURRENT_YEAR]]",
          },
        ],
        collections,
      })
    ).toEqual({ issues: [], warnings: [] })
  })

  it("rejects unknown and legacy placeholders with useful suggestions", () => {
    const validation = validateAutomationHookTokens({
      hooks: [
        { id: "sign", text: "Why [[SIGN]] is [DAMNING TRAIT]" },
        { id: "nth", text: "The [[NTH]] clue" },
      ],
      collections,
    })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hookId: "sign",
          token: "[[SIGN]]",
          suggestion: "[[ZODIAC]]",
        }),
        expect.objectContaining({
          hookId: "sign",
          token: "[DAMNING TRAIT]",
          suggestion: "[[TRAIT]]",
        }),
        expect.objectContaining({
          hookId: "nth",
          token: "[[NTH]]",
          suggestion: "[[NUMBER]]",
        }),
      ])
    )
    expect(() =>
      assertValidAutomationHookTokens({
        hooks: [{ id: "sign", text: "Why [[SIGN]] wins" }],
        collections,
      })
    ).toThrow("did you mean [[ZODIAC]]")
  })

  it("warns when NUMBER is used where SLIDE_COUNT may be intended", () => {
    expect(
      validateAutomationHookTokens({
        hooks: [{ id: "count", text: "[[NUMBER]] signs they like you" }],
        collections,
      }).warnings
    ).toEqual([
      expect.objectContaining({
        hookId: "count",
        code: "free_count_variable",
        token: "[[NUMBER]]",
      }),
    ])
  })
})
