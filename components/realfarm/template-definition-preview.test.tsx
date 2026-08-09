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
    expect(markup).toContain('style="aspect-ratio:4 / 5"')
    expect(markup).toContain('data-template-preview-ratio="configured"')
    expect(markup).toContain('data-template-preview-media="cover"')
    expect(markup).toContain('preserveAspectRatio="xMidYMid slice"')
    expect(markup).not.toContain("h-[92%]")
    expect(markup).not.toContain("max-w-[88%]")
    expect(markup).not.toContain("Current slideshow template")
    expect(markup).not.toContain("Open editor")
    expect(markup).not.toContain("No recent generation")
  })

  it("uses a compact landscape card for X and Threads templates", () => {
    const postTemplate: Automation = {
      ...slideshow,
      id: "template-post",
      name: "Founder posts",
      automationKind: "x_threads",
      platform: "x",
    }
    const markup = renderToStaticMarkup(
      <TemplateDefinitionPreview
        automation={postTemplate}
        collections={[]}
        demoVideos={[]}
        onOpen={() => undefined}
      />
    )

    expect(markup).toContain('data-template-preview-kind="post"')
    expect(markup).toContain('style="aspect-ratio:4 / 3"')
    expect(markup).toContain('data-template-preview-ratio="configured"')
  })

  it("keeps generated covers at their intrinsic image ratio", () => {
    const markup = renderToStaticMarkup(
      <TemplateDefinitionPreview
        automation={slideshow}
        config={defaultAutomationSchema(slideshow)}
        collections={[]}
        demoVideos={[]}
        previewImageUrl="https://slides.example/native-cover.jpg"
        onOpen={() => undefined}
      />
    )

    expect(markup).toContain('data-template-preview-ratio="intrinsic"')
    expect(markup).toContain('class="block h-auto w-full"')
    expect(markup).not.toContain("aspect-ratio:")
    expect(markup).not.toContain("object-cover")
  })
})
