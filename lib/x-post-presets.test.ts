import { describe, expect, it } from "vitest"

import {
  postArchetypes,
  threadsPostArchetypes,
} from "@/lib/x-post-presets"

describe("X and Threads post presets", () => {
  it("has positive weights, slots, and unique slot keys", () => {
    for (const archetype of postArchetypes) {
      expect(archetype.weight).toBeGreaterThan(0)
      expect(archetype.slots.length).toBeGreaterThan(0)
      expect(new Set(archetype.slots.map((slot) => slot.key)).size).toBe(
        archetype.slots.length
      )
      for (const slot of archetype.slots) {
        expect(slot.maxWords).toBeGreaterThanOrEqual(slot.minWords)
      }
    }
  })

  it("keeps Threads single-only and proof formats safely degradable", () => {
    expect(threadsPostArchetypes.every((item) => item.kind === "single")).toBe(
      true
    )
    for (const archetype of postArchetypes.filter((item) => item.needsProof)) {
      expect(
        archetype.platform === "threads" ||
          archetype.slots.some((slot) => slot.optional)
      ).toBe(true)
    }
  })
})
