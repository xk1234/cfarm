import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  TemplateGeneratedPreview,
  generatedExampleSlideshows,
} from "@/components/realfarm/template-showcase-preview"

describe("template showcase generated previews", () => {
  it("passes recent automation runs into template showcase surfaces", () => {
    const workspaceSource = readFileSync(
      path.join(process.cwd(), "components", "realfarm-workspace.tsx"),
      "utf8"
    )
    const editorSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-editor.tsx"
      ),
      "utf8"
    )

    expect(workspaceSource).toContain("exampleRunsByTemplateId")
    expect(workspaceSource).toContain("showcaseRunsByAutomationId")
    expect(workspaceSource).toContain(
      "recentRunsByAutomationId={showcaseRunsByAutomationId}"
    )
    expect(workspaceSource).toContain(
      "recentRunsByAutomationId={recentRunsByAutomationId}"
    )
    expect(editorSource).toContain("recentRunsByAutomationId")
    expect(editorSource).toContain(
      "recentRunsByAutomationId={recentRunsByAutomationId}"
    )
  })

  it("renders template cards from generated example slides or placeholders", () => {
    const homeSource = readFileSync(
      path.join(process.cwd(), "components", "realfarm", "home-view.tsx"),
      "utf8"
    )
    const templatesSource = readFileSync(
      path.join(process.cwd(), "components", "realfarm", "templates.tsx"),
      "utf8"
    )
    const formatModalSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-format-modal.tsx"
      ),
      "utf8"
    )
    const exampleModalSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "example-slideshow-modal.tsx"
      ),
      "utf8"
    )
    const previewSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "template-showcase-preview.tsx"
      ),
      "utf8"
    )

    expect(homeSource).toContain("ExampleSlideshowModal")
    expect(homeSource).toContain("onOpenExamples")
    expect(templatesSource).toContain("TemplateGeneratedPreview")
    expect(templatesSource).toContain("exampleSlides={generatedExampleSlides")
    expect(templatesSource).toContain("ExampleSlideshowModal")
    expect(templatesSource).toContain(
      "View ${automation.name} example slideshow"
    )
    expect(exampleModalSource).toContain("generatedExampleSlideshows")
    expect(exampleModalSource).toContain(
      "const visibleSlots = [activeSlide - 1, activeSlide, activeSlide + 1]"
    )
    expect(exampleModalSource).toContain("`Slideshow ${activeSlide + 1}`")
    expect(exampleModalSource).toContain("setActiveSlide(nextIndex)")
    expect(exampleModalSource).toContain('aria-hidden="true"')
    expect(formatModalSource).toContain("TemplateGeneratedPreview")
    expect(formatModalSource).toContain("exampleSlides={generatedExampleSlides")
    expect(previewSource).toContain("No example slideshow yet")
    expect(previewSource).toContain("slide.text")
    expect(previewSource).toContain('slide.section !== "hook"')
    expect(previewSource).toContain("slide.imageUrl")
    expect(exampleModalSource).toContain('slide.section !== "hook"')
    expect(templatesSource).not.toContain("templateImages(automation")
    expect(formatModalSource).not.toContain("templatePreviewImages")
  })

  it("keeps example slideshow runs grouped for the modal selector", () => {
    const slideshows = generatedExampleSlideshows([
      {
        id: "run-1",
        plan: {
          slides: [
            { id: "a", imageUrl: "https://example.com/a.jpg", text: "First" },
            {
              id: "b",
              role: "content",
              imageUrl: "https://example.com/b.jpg",
              text: "Second",
            },
          ],
        },
      },
      {
        id: "run-2",
        plan: {
          slides: [
            {
              id: "c",
              imageUrl: "https://example.com/c.jpg",
              imageCaption: "Third",
            },
          ],
        },
      },
    ])

    expect(slideshows).toEqual([
      {
        id: "run-1",
        label: "Slideshow 1",
        slides: [
          {
            id: "run-1-a",
            imageUrl: "https://example.com/a.jpg",
            text: "First",
            section: "hook",
          },
          {
            id: "run-1-b",
            imageUrl: "https://example.com/b.jpg",
            text: "Second",
            section: "content",
          },
        ],
      },
      {
        id: "run-2",
        label: "Slideshow 2",
        slides: [
          {
            id: "run-2-c",
            imageUrl: "https://example.com/c.jpg",
            text: "Third",
            section: "hook",
          },
        ],
      },
    ])
  })

  it("does not paint an extra text overlay on hook slide previews", () => {
    const markup = TemplateGeneratedPreview({
      exampleSlides: [
        {
          id: "hook-slide",
          imageUrl: "https://example.com/hook.jpg",
          text: "hook already in image",
          section: "hook",
        },
        {
          id: "content-slide",
          imageUrl: "https://example.com/content.jpg",
          text: "content overlay",
          section: "content",
        },
      ],
      tileCount: 2,
    })

    const rendered = JSON.stringify(markup)

    expect(rendered.match(/hook already in image/g)?.length).toBe(1)
    expect(rendered.match(/content overlay/g)?.length).toBe(2)
  })
})
