import { describe, expect, it } from "vitest"

import { runProductionPipelineStage } from "@/lib/production-pipeline-runtime"

describe("production pipeline stage runtime", () => {
  it("runs a registered deterministic stage directly", async () => {
    const execution = await runProductionPipelineStage({
      ownerId: "owner-1",
      requestId: "request-1",
      stageId: "linkedin-generation.validate-input",
      stageInput: {
        niche: "SaaS",
        topic: "Workflow observability",
        persona: "educator",
        count: 1,
      },
    })

    expect(execution).toMatchObject({
      requestId: "request-1",
      status: "succeeded",
      externalCalls: 0,
      stage: {
        id: "linkedin-generation.validate-input",
        workflowId: "linkedin-generation",
      },
      output: {
        normalizedInput: {
          niche: "SaaS",
          topic: "Workflow observability",
          persona: "educator",
          count: 1,
        },
        validationErrors: [],
      },
    })
  })
})
