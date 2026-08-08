import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { defaultAutomationSchema } from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

import { SlideSequencePanel } from "./slide-sequence-panel"

const automation: Automation = {
  id: "slide-editor-test",
  name: "Slide editor test",
  status: "paused",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "education",
  socialIntegrations: [],
}

describe("SlideSequencePanel", () => {
  it("uses a canvas-first editor with one properties rail and a slide filmstrip", () => {
    const html = renderToStaticMarkup(
      <SlideSequencePanel
        config={defaultAutomationSchema(automation)}
        collections={[]}
        onCreateCollection={vi.fn()}
        onConfigChange={vi.fn()}
      />
    )

    expect(html).toContain("Slide 1")
    expect(html).toContain("Slide 1 properties")
    expect(html).toContain("Usage")
    expect(html).toContain("Images")
    expect(html).toContain("Text")
    expect(html).toContain("Appearance")
    expect(html).toContain('aria-label="Slides"')
    expect(html).toContain('aria-label="Add slide design"')
    expect(html).toContain('aria-label="Fit canvas"')
    expect(html).not.toContain('aria-label="Slide inspector"')
    expect(html).not.toContain(">Name<")
    expect(html).not.toContain("Display text")
    expect(html).not.toContain(">Image grid<")
    expect(html).not.toContain(">Ratio<")
  })
})
