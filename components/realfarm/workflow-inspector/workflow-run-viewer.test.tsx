import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { WorkflowRunViewer } from "./workflow-run-viewer"
import type { WorkflowInspectorRun } from "./types"

const run: WorkflowInspectorRun = {
  id: "run-1234567890",
  workflowName: "LinkedIn generation",
  status: "succeeded",
  startedAt: "2026-08-11T10:00:00.000Z",
  completedAt: "2026-08-11T10:00:12.000Z",
  stages: [
    {
      id: "inputs",
      shortLabel: "Inputs",
      title: "Resolve inputs",
      description: "Resolve the persisted workflow inputs.",
      kind: "deterministic",
      status: "succeeded",
      input: { kind: "metadata", value: { niche: "Interior design" } },
      result: { kind: "metadata", value: { audience: "Homeowners" } },
      canRun: false,
      runDisabledReason: "Dependencies unavailable.",
    },
    {
      id: "generate",
      shortLabel: "Generate",
      title: "Generate post",
      description: "Generate the final post from the resolved prompt.",
      kind: "provider",
      status: "succeeded",
      input: {
        kind: "prompt",
        value: { messages: [{ role: "user", content: "Write the post" }] },
      },
      result: { kind: "copy", value: { post: "A finished post" } },
      canRun: true,
    },
  ],
}

describe("WorkflowRunViewer", () => {
  it("renders the contract regions in their required order", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRunViewer
        run={run}
        backHref="/app/runs"
        onRunWorkflow={vi.fn()}
        onRunStage={vi.fn()}
      />
    )

    const runHeader = markup.indexOf("Run run-1234567890")
    const stageNavigation = markup.indexOf('aria-label="Workflow stages"')
    const stageHeader = markup.indexOf("Generate post")
    const tabs = markup.indexOf('aria-label="Stage inspector views"')
    const result = markup.indexOf("A finished post")

    expect(runHeader).toBeGreaterThan(-1)
    expect(stageNavigation).toBeGreaterThan(runHeader)
    expect(stageHeader).toBeGreaterThan(stageNavigation)
    expect(tabs).toBeGreaterThan(stageHeader)
    expect(result).toBeGreaterThan(tabs)
    expect(markup).toContain("Back to runs")
    expect(markup).toContain("Run workflow")
    expect(markup).toContain("Run step")
    expect(markup).toContain('aria-label="Previous stage"')
    expect(markup).toContain('aria-label="Next stage"')
  })
})
