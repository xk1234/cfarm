import { describe, expect, it } from "vitest"

import {
  buildSlideshowInspectorRun,
  buildSlideshowWorkflowSteps,
  suggestedSlideshowStepIndex,
} from "./slideshow-workflow"
import type { AutomationRunApiRecord } from "./types"

const run: AutomationRunApiRecord = {
  id: "run-1",
  automationId: "automation-1",
  automationTitle: "Summer skincare",
  scheduledFor: "2026-08-03T12:00:00.000Z",
  status: "succeeded",
  createdAt: "2026-08-03T12:00:00.000Z",
  slideshowId: "slideshow-1",
  outputImages: ["/slide-1.png"],
  plan: {
    title: "Summer skincare",
    hook: "Three sunscreen mistakes",
    hookCandidates: ["Three sunscreen mistakes"],
    imageCollectionIds: ["collection-1"],
    debug: {
      selectedHookIndex: 0,
      textModelPrompt: { messages: [] },
      textGenerationResult: { title: "Summer skincare" },
      generatedCaption: "Wear sunscreen every day",
    },
    slides: [
      {
        id: "slide-1",
        role: "hook",
        text: "Three sunscreen mistakes",
        imageUrl: "/source.png",
        imageCaption: "Sunscreen bottle",
      },
    ],
  },
}

describe("slideshow workflow", () => {
  it("reconstructs the persisted generation inputs and outputs", () => {
    const steps = buildSlideshowWorkflowSteps(run)

    expect(steps.map((step) => step.label)).toEqual([
      "Load generation input",
      "Select and expand hook",
      "Generate slideshow text",
      "Select slide images",
      "Render and store slides",
    ])
    expect(steps.every((step) => step.status === "complete")).toBe(true)
    expect(suggestedSlideshowStepIndex(steps)).toBe(4)
    expect(steps[2].output).toMatchObject({
      providerResult: { title: "Summer skincare" },
      generatedCaption: "Wear sunscreen every day",
    })
  })

  it("maps the persisted run into the shared workflow inspector contract", () => {
    const inspector = buildSlideshowInspectorRun(run)

    expect(inspector.workflowName).toBe("Summer skincare")
    expect(inspector.status).toBe("succeeded")
    expect(inspector.stages.map((stage) => stage.shortLabel)).toEqual([
      "Inputs",
      "Hook",
      "Generate",
      "Images",
      "Complete",
    ])
    expect(inspector.stages[2]).toMatchObject({
      kind: "provider",
      input: { kind: "prompt" },
      result: { kind: "storyboard" },
      canRun: true,
    })
    expect(inspector.stages[4].result).toMatchObject({ kind: "final" })
  })

  it("selects the failed step when generation stopped", () => {
    const steps = buildSlideshowWorkflowSteps({
      ...run,
      status: "failed",
      slideshowId: undefined,
      outputImages: undefined,
      error: "Rendering failed",
    })

    expect(steps.at(-1)?.status).toBe("failed")
    expect(suggestedSlideshowStepIndex(steps)).toBe(4)
  })
})
