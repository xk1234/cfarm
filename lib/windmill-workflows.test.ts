import { afterEach, describe, expect, it, vi } from "vitest"

import {
  queueWindmillWorkflow,
  runWindmillPipelineStage,
  windmillConfigured,
} from "@/lib/windmill-workflows"

afterEach(() => vi.unstubAllEnvs())

describe("Windmill workflow client", () => {
  it("queues the conventionally named flow with a composable stage window", async () => {
    configureWindmill()
    const fetchImpl = vi.fn(
      async () => new Response("job-123", { status: 201 })
    )

    const result = await queueWindmillWorkflow({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      requestId: "request-1",
      workflowInput: { automationId: "automation-1" },
      startAt: "slideshow-generation.build-text-prompt",
      stopAfter: "slideshow-generation.generate-slide-text",
      fetchImpl,
    })

    expect(result).toEqual({
      workflowId: "slideshow-generation",
      requestId: "request-1",
      status: "queued",
      jobId: "job-123",
      flowPath: "f/lumenclip/slideshow_generation",
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://windmill.example/api/w/lumenclip/jobs/run/f/f/lumenclip/slideshow_generation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          owner_id: "owner-1",
          request_id: "request-1",
          input: { automationId: "automation-1" },
          start_at: "slideshow-generation.build-text-prompt",
          stop_after: "slideshow-generation.generate-slide-text",
        }),
      })
    )
  })

  it("runs one stage through the shared Windmill script", async () => {
    configureWindmill()
    const execution = {
      stage: {
        id: "linkedin-generation.validate-input",
        workflowId: "linkedin-generation",
      },
      requestId: "request-2",
      status: "succeeded",
      externalCalls: 0,
      output: { normalizedInput: { niche: "SaaS" } },
    }
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(execution), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    )

    await expect(
      runWindmillPipelineStage({
        ownerId: "owner-1",
        requestId: "request-2",
        stageId: "linkedin-generation.validate-input",
        stageInput: { niche: "SaaS" },
        fetchImpl,
      })
    ).resolves.toEqual(execution)
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://windmill.example/api/w/lumenclip/jobs/run_wait_result/p/f/lumenclip/run_pipeline_stage",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("rejects invalid partial workflow ranges before making a request", async () => {
    configureWindmill()
    const fetchImpl = vi.fn()

    await expect(
      queueWindmillWorkflow({
        workflowId: "linkedin-generation",
        ownerId: "owner-1",
        workflowInput: {},
        startAt: "linkedin-generation.complete-batch",
        stopAfter: "linkedin-generation.validate-input",
        fetchImpl,
      })
    ).rejects.toThrow("stopAfter must be")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("reports missing Windmill configuration without falling back in-process", async () => {
    vi.stubEnv("WINDMILL_BASE_URL", "")
    vi.stubEnv("WINDMILL_WORKSPACE_ID", "")
    vi.stubEnv("WINDMILL_TOKEN", "")

    expect(windmillConfigured()).toBe(false)
    await expect(
      queueWindmillWorkflow({
        workflowId: "linkedin-generation",
        ownerId: "owner-1",
        workflowInput: { niche: "SaaS" },
      })
    ).rejects.toThrow("WINDMILL_BASE_URL is not configured")
  })
})

function configureWindmill() {
  vi.stubEnv("WINDMILL_BASE_URL", "https://windmill.example")
  vi.stubEnv("WINDMILL_WORKSPACE_ID", "lumenclip")
  vi.stubEnv("WINDMILL_TOKEN", "windmill-token")
}
