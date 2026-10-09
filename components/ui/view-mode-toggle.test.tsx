import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ViewModeToggle } from "./view-mode-toggle"

describe("ViewModeToggle", () => {
  it("uses an accessible single-select toggle group", () => {
    const markup = renderToStaticMarkup(
      <ViewModeToggle value="grid" onChange={vi.fn()} />
    )

    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('role="radio"')
    expect(markup).toContain('aria-label="View mode"')
    expect(markup).toContain('aria-label="Grid view"')
    expect(markup).toContain('aria-label="Table view"')
    expect(markup).toContain('data-state="on"')
  })
})
