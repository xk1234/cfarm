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
  it("keeps per-slide controls focused on purpose, media, and styling", () => {
    const html = renderToStaticMarkup(
      <SlideSequencePanel
        config={defaultAutomationSchema(automation)}
        collections={[]}
        onCreateCollection={vi.fn()}
        onConfigChange={vi.fn()}
      />
    )

    expect(html).toContain("Slide 1")
    expect(html).toContain("Usage")
    expect(html).not.toContain(">Name<")
    expect(html).not.toContain("Display text")
    expect(html).not.toContain(">Image grid<")
    expect(html).not.toContain(">Ratio<")
  })
})
