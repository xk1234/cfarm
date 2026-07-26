import { describe, expect, it } from "vitest"

import {
  computeWordRange,
  computeWordRangesByRole,
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
      wordRange: { min: 4, max: 40 },
      wordRangeByRole: {
        hook: { min: 4, max: 6 },
        body: { min: 30, max: 40 },
        cta: { min: 8, max: 8 },
      },
      structure: { hookSlides: 1, bodySlides: 4, ctaSlides: 1 },
      observations: ["Second person.", "Short fragments."],
      seedHook: "You are arranging this room wrong",
    })

    // Each section carries its OWN range; sharing one range across hook and
    // body would licence a hook as long as a body slide.
    expect(fields.formatting).toHaveLength(3)
    expect(fields.formatting?.map((section) => section.textItems[0])).toEqual([
      expect.objectContaining({ wordLengthMin: 4, wordLengthMax: 6 }),
      expect.objectContaining({ wordLengthMin: 30, wordLengthMax: 40 }),
      expect.objectContaining({ wordLengthMin: 8, wordLengthMax: 8 }),
    ])
    expect(fields.hooks?.[0]).toMatchObject({
      text: "You are arranging this room wrong",
      enabled: true,
    })
  })
})

describe("computeWordRangesByRole", () => {
  // Word counts taken from the real @horoiq/photo/7662360324313517330 slideshow.
  const cancerSlides = [
    { text: "3 things a Cancer will never tell you" },
    { text: Array.from({ length: 62 }, () => "word").join(" ") },
    { text: Array.from({ length: 60 }, () => "word").join(" ") },
    { text: Array.from({ length: 59 }, () => "word").join(" ") },
  ]

  it("keeps the hook range separate from the body range", () => {
    const ranges = computeWordRangesByRole(cancerSlides)
    expect(ranges.hook).toEqual({ min: 8, max: 8 })
    expect(ranges.body.min).toBeGreaterThan(ranges.hook.max)
  })

  it("falls back to the overall range when there is too little to split", () => {
    const ranges = computeWordRangesByRole([{ text: "one two three" }])
    expect(ranges.hook).toEqual(ranges.body)
    expect(ranges.body).toEqual(ranges.cta)
  })

  it("ignores slides with no text", () => {
    const ranges = computeWordRangesByRole([
      { text: "a hook of six words here" },
      { text: "" },
      { text: "body copy" },
    ])
    expect(ranges.hook).toEqual({ min: 6, max: 6 })
  })
})
