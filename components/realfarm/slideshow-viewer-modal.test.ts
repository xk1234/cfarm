import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("SlideshowViewerModal", () => {
  it("shows the generated slide image without adding duplicate styled text", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/slideshow-viewer-modal.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("src={slide.imageUrl}")
    expect(source).not.toContain("text-yellow-100")
    expect(source).not.toContain('slide.section !== "hook"')
    expect(source).not.toContain("absolute inset-0 bg-black/20")
    expect(source).not.toContain("CheckedDropdownButton")
    expect(source).toContain("Export PNGs")
    expect(source).toContain("exportSlideshowAsPngZip")
    expect(source).toContain('aria-label="Copy title"')
    expect(source).toContain('aria-label="Copy description and hashtags"')
    expect(source).toContain('.join("\\n\\n")')
    expect(source).toContain("navigator.clipboard.writeText(value)")
  })
})
