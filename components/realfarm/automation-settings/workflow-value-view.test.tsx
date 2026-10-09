import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { SlideshowWorkflowStep } from "./slideshow-workflow"
import {
  parseSerializedJson,
  readable,
  WorkflowValueView,
} from "./workflow-value-view"

const promptStep: SlideshowWorkflowStep = {
  id: "generate-text",
  label: "Generate slideshow text",
  status: "complete",
  input: {},
}

describe("WorkflowValueView", () => {
  it("renders provider messages as prompts with real line breaks", () => {
    const html = renderToStaticMarkup(
      <WorkflowValueView
        step={promptStep}
        direction="input"
        value={{
          model: "anthropic/claude-sonnet-4",
          max_tokens: 2048,
          messages: [
            { role: "system", content: "First line\\nSecond line" },
            { role: "user", content: "Write the slides" },
          ],
        }}
      />
    )

    expect(html).toContain('data-workflow-view="provider-request"')
    expect(html).toContain("system prompt")
    expect(html).toContain("First line\nSecond line")
    expect(html).not.toContain("First line\\nSecond line")
    expect(html).toContain("Raw input JSON")
  })

  it("renders slide images as visual previews", () => {
    const html = renderToStaticMarkup(
      <WorkflowValueView
        step={{ ...promptStep, id: "select-images" }}
        direction="output"
        value={{
          slides: [
            {
              index: 1,
              imageUrl: "https://images.example/slide-1.jpg",
              imageCaption: "A bottle on a table",
            },
          ],
        }}
      />
    )

    expect(html).toContain('data-workflow-view="media-payload"')
    expect(html).toContain('src="https://images.example/slide-1.jpg"')
    expect(html).toContain("A bottle on a table")
    expect(html).toContain("Open original")
  })

  it("parses serialized JSON payloads", () => {
    expect(parseSerializedJson('{"messages":[]}')).toEqual({ messages: [] })
    expect(parseSerializedJson("plain text")).toBe("plain text")
    expect(readable("first\\r\\nsecond\\nthird")).toBe("first\nsecond\nthird")
  })
})
