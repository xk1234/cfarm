import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  TemplatesView,
  templatesForVisibility,
} from "@/components/realfarm/automations-view"
import { defaultAutomationSchema } from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const activeTemplate: Automation = {
  id: "active-1",
  name: "Daily stories",
  hidden: false,
  automationKind: "slideshow",
  status: "live",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "editorial",
  socialIntegrations: [],
}

const hiddenTemplate: Automation = {
  ...activeTemplate,
  id: "starter-1",
  name: "Astrology slideshow",
  hidden: true,
}

describe("TemplatesView", () => {
  it("uses active and hidden tabs over one template collection", () => {
    const markup = renderToStaticMarkup(
      <TemplatesView
        automations={[activeTemplate, hiddenTemplate]}
        schemasByAutomationId={{
          [activeTemplate.id]: defaultAutomationSchema(activeTemplate),
          [hiddenTemplate.id]: defaultAutomationSchema(hiddenTemplate),
        }}
        previewImagesByAutomationId={{}}
        collections={[]}
        demoVideos={[]}
        onCreateFromTone={vi.fn().mockResolvedValue(undefined)}
        onRename={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleHidden={vi.fn()}
        onEdit={vi.fn()}
      />
    )

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain("Active")
    expect(markup).toContain("Hidden")
    expect(markup).toContain("Daily stories")
    expect(markup).not.toContain("Astrology slideshow")
    expect(markup).not.toContain("Starter templates")
    expect(markup).not.toContain("Your templates")
  })

  it("filters the same record type by hidden state", () => {
    expect(
      templatesForVisibility([activeTemplate, hiddenTemplate], "active").map(
        (template) => template.id
      )
    ).toEqual(["active-1"])
    expect(
      templatesForVisibility([activeTemplate, hiddenTemplate], "hidden").map(
        (template) => template.id
      )
    ).toEqual(["starter-1"])
  })

  it("uses a generated image as a normal hidden template cover", () => {
    const markup = renderToStaticMarkup(
      <TemplatesView
        automations={[{ ...hiddenTemplate, hidden: false }]}
        schemasByAutomationId={{
          [hiddenTemplate.id]: defaultAutomationSchema(hiddenTemplate),
        }}
        previewImagesByAutomationId={{
          [hiddenTemplate.id]: "https://slides.example/latest.jpg",
        }}
        collections={[]}
        demoVideos={[]}
        onCreateFromTone={vi.fn().mockResolvedValue(undefined)}
        onRename={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleHidden={vi.fn()}
        onEdit={vi.fn()}
      />
    )

    expect(markup).toContain("https://slides.example/latest.jpg")
    expect(markup).toContain('data-template-preview-media="generated"')
    expect(markup).toContain("latest generated preview")
    expect(markup).not.toContain("Starter")
  })
})
