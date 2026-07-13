import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

describe("generated slideshow display contract", () => {
  it("never redraws slide copy over an already-rendered image", () => {
    const viewer = source("components/realfarm/slideshow-viewer-modal.tsx")
    const showcase = source(
      "components/realfarm/template-showcase-preview.tsx"
    )
    const overview = source(
      "components/realfarm/automation-settings/overview-panel.tsx"
    )

    for (const display of [viewer, showcase, overview]) {
      expect(display).not.toContain("text-yellow-100")
      expect(display).not.toContain('slide.section !== "hook"')
    }
  })

  it("does not leak mock thumbnail copy into generated-run fallbacks", () => {
    const frame = source(
      "components/realfarm/automation-settings/generated-slideshow-frame.tsx"
    )
    const overview = source(
      "components/realfarm/automation-settings/overview-panel.tsx"
    )

    expect(frame).not.toContain("AutomationThumb")
    expect(overview).not.toContain("AutomationThumb")
    expect(frame).toContain("No rendered image")
    expect(overview).toContain("No rendered image")
  })
})
