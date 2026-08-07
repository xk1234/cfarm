import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { TemplatesView } from "@/components/realfarm/automations-view"
import { defaultAutomationSchema } from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const starter: Automation = {
  id: "starter-1",
  name: "Astrology slideshow",
  automationKind: "slideshow",
  status: "live",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "editorial",
  socialIntegrations: [],
}

describe("TemplatesView", () => {
  it("places starter templates on the page with editor-definition previews", () => {
    const markup = renderToStaticMarkup(
      <TemplatesView
        automations={[]}
        schemasByAutomationId={{}}
        starterTemplates={[starter]}
        starterSchemasByAutomationId={{
          [starter.id]: defaultAutomationSchema(starter),
        }}
        collections={[]}
        demoVideos={[]}
        onUseStarterTemplate={vi.fn()}
        onCreateFromTone={vi.fn().mockResolvedValue(undefined)}
        onRename={vi.fn()}
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
      />
    )

    expect(markup).toContain("Starter templates")
    expect(markup).toContain("Your templates")
    expect(markup).toContain('data-template-preview-media="cover"')
    expect(markup).toContain(
      'aria-label="Use Astrology slideshow starter template"'
    )
    expect(markup).not.toContain("New template")
    expect(markup).not.toContain("TemplateGeneratedPreview")
  })
})
