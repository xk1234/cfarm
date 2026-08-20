import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { defaultAutomationSchema } from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

import { AutomationSettingsDrawer } from "./drawer"

const automation: Automation = {
  id: "drawer-test",
  name: "Drawer test",
  status: "paused",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "education",
  socialIntegrations: [],
}

describe("AutomationSettingsDrawer", () => {
  it("keeps Generate available during ordinary editing and removes template actions from the navbar", () => {
    const html = renderToStaticMarkup(
      <AutomationSettingsDrawer
        modal
        automation={automation}
        config={defaultAutomationSchema(automation)}
        collections={[]}
        selectedSound={null}
        music={[]}
        demoVideos={[]}
        onCreateCollection={vi.fn()}
        onRename={vi.fn()}
        onConfigChange={vi.fn()}
        onEditSocialAccounts={vi.fn()}
        onDuplicate={vi.fn(async () => undefined)}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const generateButton = html.match(
      /<button[^>]*aria-label="Generate template"[^>]*>/
    )?.[0]
    expect(generateButton).toBeTruthy()
    expect(generateButton).not.toMatch(/\sdisabled(?:=|>)/)
    expect(html).not.toContain('aria-label="Duplicate template"')
    expect(html).not.toContain('aria-label="Delete template"')
  })
})
