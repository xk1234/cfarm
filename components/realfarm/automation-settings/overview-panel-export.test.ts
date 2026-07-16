import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("automation editor slideshow export", () => {
  it("wires PNG ZIP export into the generated slideshow viewer", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/overview-panel.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("exportSlideshowAsPngZip")
    expect(source).toContain("exportableAutomationRunSlides(run)")
    expect(source).toContain(
      "disabled={exporting || exportableSlides.length === 0}"
    )
    expect(source).toContain("Export PNGs")
  })
})
