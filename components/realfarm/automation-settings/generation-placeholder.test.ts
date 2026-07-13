import { describe, expect, it } from "vitest"

import { generatingSlidePlaceholderDataUrl } from "./run-helpers"

describe("generating slideshow placeholder", () => {
  it("is a black slide containing only the generating label", () => {
    const dataUrl = generatingSlidePlaceholderDataUrl("9:16")
    const svg = decodeURIComponent(dataUrl.split(",", 2)[1] ?? "")

    expect(svg).toContain('fill="#000"')
    expect(svg).toContain('fill="#fff"')
    expect(svg).toContain(">Generating...</text>")
    expect(svg).not.toContain("Selecting images")
    expect(svg).not.toContain("Preview will update")
  })

  it("matches the configured slide ratio", () => {
    const svg = decodeURIComponent(
      generatingSlidePlaceholderDataUrl("4:5").split(",", 2)[1] ?? ""
    )

    expect(svg).toContain('width="1080" height="1350"')
  })
})
