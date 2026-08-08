import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  defaultAutomationSchema,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

import { AutomationGeneralSettingsPanel } from "./general-settings"

const automation: Automation = {
  id: "settings-test",
  name: "Settings test",
  status: "paused",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "education",
  socialIntegrations: [],
}

function renderSettings(config: AutomationSchema) {
  return renderToStaticMarkup(
    <AutomationGeneralSettingsPanel
      config={config}
      selectedSound={null}
      music={[]}
      onConfigChange={vi.fn()}
    />
  )
}

describe("AutomationGeneralSettingsPanel", () => {
  it("shows slideshow ratio and image grid as global settings", () => {
    const html = renderSettings(defaultAutomationSchema(automation))

    expect(html).toContain("Aspect ratio")
    expect(html).toContain('aria-label="Slideshow aspect ratio"')
    expect(html).toContain("Image grid")
    expect(html).toContain('aria-label="Slideshow image grid"')
  })

  it("does not show slideshow layout settings for video templates", () => {
    const config = defaultAutomationSchema({
      ...automation,
      automationKind: "video",
    })
    const html = renderSettings(config)

    expect(html).not.toContain('aria-label="Slideshow aspect ratio"')
    expect(html).not.toContain('aria-label="Slideshow image grid"')
  })

  it("keeps template-level duplicate and delete actions in Settings", () => {
    const html = renderToStaticMarkup(
      <AutomationGeneralSettingsPanel
        config={defaultAutomationSchema(automation)}
        selectedSound={null}
        music={[]}
        onConfigChange={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(html).toContain("Duplicate template")
    expect(html).toContain("Delete template")
  })
})
