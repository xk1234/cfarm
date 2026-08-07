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
  it("shows an honest empty state when a starter has no generation", () => {
    const markup = renderToStaticMarkup(
      <TemplatesView
        automations={[]}
        schemasByAutomationId={{}}
        starterTemplates={[starter]}
        starterSchemasByAutomationId={{
          [starter.id]: defaultAutomationSchema(starter),
        }}
        starterPreviewImagesByAutomationId={{}}
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
    expect(markup).toContain("No generation yet")
    expect(markup).toContain(
      'aria-label="Use Astrology slideshow starter template"'
    )
    expect(markup).not.toContain("New template")
    expect(markup).not.toContain("TemplateGeneratedPreview")
    expect(markup).not.toContain("Hook text")
  })

  it("uses the latest generated image for a starter template cover", () => {
    const markup = renderToStaticMarkup(
      <TemplatesView
        automations={[]}
        schemasByAutomationId={{}}
        starterTemplates={[starter]}
        starterSchemasByAutomationId={{
          [starter.id]: defaultAutomationSchema(starter),
        }}
        starterPreviewImagesByAutomationId={{
          [starter.id]: "https://slides.example/latest.jpg",
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

    expect(markup).toContain("https://slides.example/latest.jpg")
    expect(markup).toContain('data-template-preview-media="generated"')
    expect(markup).toContain("latest generated preview")
    expect(markup).not.toContain("Hook text")
  })
})
