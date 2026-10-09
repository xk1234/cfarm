import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { promptCandidates, WorkflowForkPanel } from "./workflow-fork-panel"
import type { AutomationRunApiRecord } from "./types"

describe("promptCandidates", () => {
  it("returns stable JSON-pointer paths for selectable prompt messages", () => {
    expect(promptCandidates(prompt)).toEqual([
      {
        label: "System prompt",
        path: "/messages/0/content",
        content: "System instructions",
      },
      {
        label: "User prompt",
        path: "/messages/1/content",
        content: "A very long user prompt",
      },
    ])
  })

  it("opens as an entire-input fork with partial selection as a secondary action", () => {
    const html = renderToStaticMarkup(
      <WorkflowForkPanel run={run} prompt={prompt} onClose={() => undefined} />
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain("Entire input")
    expect(html).toContain("Fork only part of input")
    expect(html).toContain("A very long user prompt")
    expect(html).toContain('aria-label="Variation A input"')
    expect(html).not.toContain("Select a passage to replace")
  })
})

const prompt = {
  messages: [
    { role: "system", content: "System instructions" },
    { role: "user", content: "A very long user prompt" },
  ],
}

const run: AutomationRunApiRecord = {
  id: "run-1",
  automationId: "automation-1",
  automationTitle: "Workflow test",
  scheduledFor: "2026-08-03T00:00:00.000Z",
  status: "succeeded",
  createdAt: "2026-08-03T00:00:00.000Z",
}
