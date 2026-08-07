import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TemplateDefinitionPreview } from "@/components/realfarm/template-definition-preview"
import {
  defaultAutomationSchema,
  schemaWithAutomationCollectionId,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const slideshow: Automation = {
  id: "template-slideshow",
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

describe("TemplateDefinitionPreview", () => {
  it("renders the saved slideshow definition as one editor link", () => {
    const config = schemaWithAutomationCollectionId(
      defaultAutomationSchema(slideshow),
      "hook",
      "astrology-images"
    )
    const markup = renderToStaticMarkup(
      <TemplateDefinitionPreview
        automation={slideshow}
        config={config}
        collections={[
          {
            id: "astrology-images",
            title: "Astrology",
            createdAt: "2026-08-07T00:00:00.000Z",
            source: "upload",
            images: [
              {
                id: "cancer",
                title: "Cancer",
                description: "Cancer astrology background",
                imageUrl: "/cancer.jpg",
                sourceUrl: "/cancer.jpg",
                dominantColor: "#222222",
              },
            ],
          },
        ]}
        demoVideos={[]}
        onOpen={() => undefined}
      />
    )

    expect(markup).toContain('data-template-preview-kind="slideshow"')
    expect(markup).toContain('aria-label="Edit Astrology slideshow template"')
    expect(markup).toContain("aspect-[9/16]")
    expect(markup).not.toContain("Current slideshow template")
    expect(markup).not.toContain("Open editor")
    expect(markup).not.toContain("No recent generation")
  })
})
