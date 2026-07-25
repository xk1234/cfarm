import { describe, expect, it } from "vitest"

import { previewTextForTextItem } from "@/lib/realfarm-preview-text"

describe("previewTextForTextItem", () => {
  it("renders lorem preview text using the configured minimum word length", () => {
    expect(previewTextForTextItem({ wordLengthMin: 5 })).toBe(
      "lorem ipsum dolor sit amet"
    )
    expect(
      previewTextForTextItem({ wordLengthMin: 10 }).split(/\s+/)
    ).toHaveLength(10)
  })

  it("clamps preview text to a compact readable range", () => {
    expect(previewTextForTextItem({ wordLengthMin: 0 })).toBe("lorem")
    expect(
      previewTextForTextItem({ wordLengthMin: 80 }).split(/\s+/)
    ).toHaveLength(30)
  })
})
