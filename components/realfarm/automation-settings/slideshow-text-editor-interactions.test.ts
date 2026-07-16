import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

describe("slideshow text editor interactions", () => {
  it("keeps the floating editor inset from the slideshow viewer edges", () => {
    const toolbar = source(
      "components/realfarm/automation-settings/format-text-toolbar.tsx"
    )

    expect(toolbar).toContain(
      '"absolute right-4 bottom-4 left-4 z-30 w-auto border border-app-panel-border"'
    )
    expect(toolbar).not.toContain(
      '"absolute right-0 bottom-0 left-0 z-30 w-full rounded-b-none"'
    )
  })

  it("dismisses the editor only when the pointer leaves its interaction boundary", () => {
    const panel = source(
      "components/realfarm/automation-settings/slideshow-format-panel.tsx"
    )
    const card = source(
      "components/realfarm/automation-settings/format-preview-card.tsx"
    )
    const toolbar = source(
      "components/realfarm/automation-settings/format-text-toolbar.tsx"
    )

    expect(panel).toContain("onPointerDown={(event) =>")
    expect(panel).toContain('target.closest("[data-slideshow-text-editor]")')
    expect(panel).toContain("setSelectedTextIndex(null)")
    expect(card).toContain('data-slideshow-text-editor="text-target"')
    expect(toolbar).toContain(
      'data-slideshow-text-editor={layout === "floating" ? "toolbar" : undefined}'
    )
  })
})
