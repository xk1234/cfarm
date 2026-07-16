import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

describe("CTA format editor layout", () => {
  it("keeps sidebar selects inside a narrow viewport", () => {
    const editor = source(
      "components/realfarm/automation-settings/content-format-editor.tsx"
    )
    const panel = source(
      "components/realfarm/automation-settings/slideshow-format-panel.tsx"
    )
    const controls = source("components/ui/form-controls.tsx")

    expect(editor).toContain("grid-cols-[minmax(0,88px)_minmax(0,1fr)]")
    expect(editor).toContain('className="max-w-full min-w-0"')
    expect(panel).toContain("w-full min-w-0 flex-col bg-app-surface-subtle md:w-[340px]")
    expect(controls).toContain(
      "w-full max-w-full min-w-0 justify-start overflow-hidden"
    )
  })
})
