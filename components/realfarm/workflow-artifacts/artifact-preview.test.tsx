import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { WorkflowArtifactPreview } from "./artifact-preview"

describe("WorkflowArtifactPreview", () => {
  it("renders slide plans as a visual sequence", () => {
    const markup = renderToStaticMarkup(
      <WorkflowArtifactPreview
        value={{
          slides: [
            {
              id: "slide-1",
              slide: 1,
              role: "hook",
              text: "The Libra habit nobody notices",
              renderedImageUrl: "/slides/one.png",
            },
          ],
        }}
      />
    )

    expect(markup).toContain('data-artifact-kind="slideshow"')
    expect(markup).toContain("Slide sequence")
    expect(markup).toContain("The Libra habit nobody notices")
    expect(markup).toContain("/slides/one.png")
  })

  it("renders selected media as a scrollable gallery", () => {
    const markup = renderToStaticMarkup(
      <WorkflowArtifactPreview
        value={{
          selectedImages: [
            {
              slide: 2,
              imageKey: "portrait-7",
              imageCaption: "Moonlit portrait",
              sourceImageUrl: "/images/moon.jpg",
            },
          ],
        }}
      />
    )

    expect(markup).toContain('data-artifact-kind="media"')
    expect(markup).toContain("Selected media")
    expect(markup).toContain("Moonlit portrait")
    expect(markup).toContain("/images/moon.jpg")
  })

  it("renders model messages without flattening them into raw JSON", () => {
    const markup = renderToStaticMarkup(
      <WorkflowArtifactPreview
        context={{ stageId: "slideshow-generation.build-text-prompt" }}
        value={{
          promptPayload: {
            messages: [
              { role: "system", content: "Write concise slide copy." },
              { role: "user", content: "Create three astrology slides." },
            ],
          },
        }}
      />
    )

    expect(markup).toContain('data-artifact-kind="prompt"')
    expect(markup).toContain("Model prompt")
    expect(markup).toContain("Write concise slide copy.")
    expect(markup).not.toContain("[object Object]")
  })

  it("renders validation state and issues", () => {
    const markup = renderToStaticMarkup(
      <WorkflowArtifactPreview
        context={{ stageId: "slideshow-generation.validate-output" }}
        value={{ passed: false, score: 0.72, issues: ["Hook is too long"] }}
      />
    )

    expect(markup).toContain('data-artifact-kind="validation"')
    expect(markup).toContain("Needs review")
    expect(markup).toContain("Quality score 72%")
    expect(markup).toContain("Hook is too long")
  })

  it("renders video scripts as timed content plans", () => {
    const markup = renderToStaticMarkup(
      <WorkflowArtifactPreview
        context={{ stageId: "ugc-video-generation.script" }}
        value={{
          plan: {
            hook: "I did not expect this to work so quickly",
            durationSeconds: 28,
            segments: [
              {
                spokenText: "This is what changed after one week.",
                brollPrompt: "Close-up product demonstration",
                startSeconds: 0,
                endSeconds: 5,
              },
            ],
          },
        }}
      />
    )

    expect(markup).toContain('data-artifact-kind="script"')
    expect(markup).toContain("Content plan")
    expect(markup).toContain("28s target")
    expect(markup).toContain("This is what changed after one week.")
    expect(markup).toContain("Close-up product demonstration")
  })
})
