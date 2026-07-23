import { describe, expect, it } from "vitest"

import {
  analyzeAutomationHookPool,
  replaceAutomationHookPool,
} from "@/lib/automation-hook-pool"
import type { AutomationHookItem } from "@/lib/realfarm-automation"

describe("automation hook pool", () => {
  it("surfaces zodiac variants and red-flag rotations as near duplicates", () => {
    const report = analyzeAutomationHookPool([
      hook("cusp-a", "The dark side of being an Aries cusp"),
      hook("cusp-b", "The dark side of being a Pisces cusp"),
      hook("red-a", "The biggest red flags of every zodiac sign"),
      hook("red-b", "Every zodiac sign and their biggest red flag"),
      hook("unique", "Why Virgos remember the detail everyone else misses"),
    ])

    expect(report.duplicateSlotCount).toBe(2)
    expect(report.duplicateGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hookIds: ["cusp-a", "cusp-b"] }),
        expect.objectContaining({ hookIds: ["red-a", "red-b"] }),
      ])
    )
  })

  it("replaces, edits, prunes, and optionally deduplicates a pool", () => {
    const current = [
      hook("cusp-a", "The dark side of being an Aries cusp"),
      hook("cusp-b", "The dark side of being a Pisces cusp"),
      hook("keep", "A genuinely distinct hook"),
    ]
    const updated = replaceAutomationHookPool({
      current,
      now: "2026-07-23T12:00:00.000Z",
      deduplicateNearMatches: true,
      hooks: [
        {
          id: "cusp-a",
          text: "The hidden side of being an Aries cusp",
          enabled: false,
        },
        {
          id: "cusp-b",
          text: "The hidden side of being a Pisces cusp",
        },
        { text: "A new distinct hook" },
      ],
    })

    expect(updated).toHaveLength(2)
    expect(updated[0]).toMatchObject({
      id: "cusp-a",
      enabled: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-23T12:00:00.000Z",
    })
    expect(updated.some((item) => item.text === "A genuinely distinct hook")).toBe(
      false
    )
    expect(updated.some((item) => item.text === "A new distinct hook")).toBe(
      true
    )
  })
})

function hook(id: string, text: string): AutomationHookItem {
  return {
    id,
    text,
    enabled: true,
    createdAt: "2026-07-01T00:00:00.000Z",
  }
}
