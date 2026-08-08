import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  defaultAutomationSchema,
  schemaWithAutomationTone,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

import { PromptConfigPanel } from "./prompt-settings"

const automation: Automation = {
  id: "prompt-settings-test",
  name: "Prompt settings test",
  status: "paused",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "education",
  socialIntegrations: [],
}

describe("PromptConfigPanel", () => {
  it("uses one writing-style control for slideshow copy", () => {
    const config = schemaWithAutomationTone(
      defaultAutomationSchema(automation),
      "Write with short, blunt sentences.",
      "custom"
    )
    const html = renderToStaticMarkup(
      <PromptConfigPanel
        automation={automation}
        config={config}
        onConfigChange={vi.fn()}
        hideFooter
      />
    )

    expect(html).toContain("Sequence instructions")
    expect(html).toContain("Writing instructions")
    expect(html).not.toContain("Slide text instructions")
    expect(html).not.toContain("Custom tone")
  })
})
