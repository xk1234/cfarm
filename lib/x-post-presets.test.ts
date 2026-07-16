import { describe, expect, it } from "vitest"

import {
  postArchetypes,
  threadsPostArchetypes,
  xPostArchetypes,
} from "@/lib/x-post-presets"

describe("X and Threads post presets", () => {
  it("contains seven active X shapes plus the astrology pattern variant and nine Threads formats", () => {
    expect(xPostArchetypes).toHaveLength(8)
    expect(threadsPostArchetypes).toHaveLength(9)
    expect(xPostArchetypes.map((item) => item.id)).toEqual(
      expect.arrayContaining(["data_drop", "pattern_drop"])
    )
    expect(threadsPostArchetypes.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "credibility_claim",
        "win_celebration",
        "controversial_humor",
      ])
    )
    expect(
      threadsPostArchetypes
        .filter((item) =>
          ["credibility_claim", "win_celebration"].includes(item.id)
        )
        .every((item) => item.needsProof)
    ).toBe(true)
  })

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
