import { describe, expect, it } from "vitest"

import { slideshowExportSlug } from "@/lib/slideshow-export"

describe("slideshowExportSlug", () => {
  it("creates a safe archive name from the slideshow title", () => {
    expect(slideshowExportSlug(" Emotional Intelligence 2! ")).toBe(
      "emotional-intelligence-2"
    )
  })

  it("uses a useful fallback for an empty title", () => {
    expect(slideshowExportSlug(" ✨ ")).toBe("lumenclip-slideshow")
  })
})
