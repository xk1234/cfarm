import { describe, expect, it } from "vitest"

import {
  computeWordRange,
  extractHashtags,
  normalizeTone,
  slideshowToneToAutomationFields,
} from "./slideshow-tone-analysis"

describe("slideshow tone analysis", () => {
  it("extracts Unicode hashtags in caption order", () => {
    expect(
      extractHashtags("Quiet design #interiors #家づくり #small-space")
    ).toEqual(["interiors", "家づくり", "small-space"])
  })

  it("computes the deterministic range from non-empty slide text", () => {
    expect(
      computeWordRange([
        { text: "Three small words" },
        { text: "" },
        { text: "A much longer closing sentence today" },
      ])
    ).toEqual({ min: 3, max: 6 })
  })

  it("maps known presets and preserves a custom fallback", () => {
    expect(
      normalizeTone({ value: "Educational & Informative", preset: "wrong" })
    ).toEqual({
      value: "Educational & Informative",
      preset: "educational",
    })
    expect(
      normalizeTone({ value: "Dry, clipped, slightly skeptical" })
    ).toEqual({
      value: "Dry, clipped, slightly skeptical",
      preset: "custom",
    })
  })

  it("prefills every text section and seeds the first-slide hook", () => {
    const fields = slideshowToneToAutomationFields({
      tone: { value: "Bold & Provocative", preset: "bold" },
      language: "English",
      wordRange: { min: 4, max: 11 },
      structure: { hookSlides: 1, bodySlides: 4, ctaSlides: 1 },
      observations: ["Second person.", "Short fragments."],
      seedHook: "You are arranging this room wrong",
    })

    expect(fields.formatting).toHaveLength(3)
    expect(fields.formatting?.map((section) => section.textItems[0])).toEqual([
      expect.objectContaining({ wordLengthMin: 4, wordLengthMax: 11 }),
      expect.objectContaining({ wordLengthMin: 4, wordLengthMax: 11 }),
      expect.objectContaining({ wordLengthMin: 4, wordLengthMax: 11 }),
    ])
    expect(fields.hooks?.[0]).toMatchObject({
      text: "You are arranging this room wrong",
      enabled: true,
    })
  })
})
