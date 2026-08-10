import { afterEach, describe, expect, it, vi } from "vitest"

import {
  queueWindmillWorkflow,
  windmillConfigured,
} from "@/lib/windmill-workflows"

afterEach(() => vi.unstubAllEnvs())

describe("Windmill workflow client", () => {
  it("queues the conventionally named flow with named top-level inputs", async () => {
    configureWindmill()
    const fetchImpl = vi.fn(
      async () => new Response("job-123", { status: 201 })
    )

    const result = await queueWindmillWorkflow({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      workflowInput: { automationId: "automation-1" },
      fetchImpl,
    })

    expect(result).toMatchObject({
      workflowId: "slideshow-generation",
      status: "queued",
      jobId: "job-123",
      flowPath: "f/lumenclip/slideshow_generation",
    })
    expect(result.requestId).toMatch(/^pipeline-/)
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://windmill.example/api/w/lumenclip/jobs/run/f/f/lumenclip/slideshow_generation",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          JSON.stringify({
            owner_id: "owner-1",
            request_id: result.requestId,
            automation_id: "automation-1",
          })
        ),
      })
    )
  })

  it("rejects inputs that do not affect the workflow output", async () => {
    configureWindmill()
    const fetchImpl = vi.fn()

    await expect(
      queueWindmillWorkflow({
        workflowId: "linkedin-generation",
        ownerId: "owner-1",
        workflowInput: {
          niche: "SaaS",
          request_id: "caller-controlled",
          unused: true,
        },
        fetchImpl,
      })
    ).rejects.toThrow(
      "linkedin-generation does not accept input request_id, unused"
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("maps fixed-video API fields to the generated Windmill form contract", async () => {
    configureWindmill()
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response("job-video", { status: 201 }))
    )

    await queueWindmillWorkflow({
      workflowId: "react-reveal-generation",
      ownerId: "owner-1",
      workflowInput: {
        templateId: "react-template",
        anticipation: { url: "https://cdn.test/a.mp4" },
        reveal: { url: "https://cdn.test/b.mp4" },
        hookCaption: "wait for it",
        payoffCaption: "the reveal",
      },
      fetchImpl,
    })

    const request = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(request!.body))).toMatchObject({
      template_id: "react-template",
      anticipation: { url: "https://cdn.test/a.mp4" },
      reveal: { url: "https://cdn.test/b.mp4" },
      hook_caption: "wait for it",
      payoff_caption: "the reveal",
    })
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
