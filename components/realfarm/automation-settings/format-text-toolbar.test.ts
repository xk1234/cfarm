import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

describe("slideshow text toolbar", () => {
  it("keeps portaled dropdown choices inside the active text editor", () => {
    expect(source("components/ui/form-controls.tsx")).toContain(
      'data-select-like-content=""'
    )
    expect(
      source(
        "components/realfarm/automation-settings/slideshow-format-panel.tsx"
      )
    ).toContain("[data-slideshow-text-editor], [data-select-like-content]")
  })

  it("maps every visible control to its runtime text-item field", () => {
    const toolbar = source(
      "components/realfarm/automation-settings/format-text-toolbar.tsx"
    )
    for (const field of [
      "textStyle",
      "fontSize",
      "textPosition",
      "textItemWidth",
      "wordLengthMin",
      "wordLengthMax",
      "textAlign",
      "textAnchor",
      "textVerticalAnchor",
    ]) {
      expect(toolbar).toContain(field)
    }
  })
})
