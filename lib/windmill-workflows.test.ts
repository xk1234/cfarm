import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getWindmillWorkflowJob,
  queueWindmillWorkflow,
  runWindmillWorkflow,
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
      })
    )
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      owner_id: "owner-1",
      request_id: result.requestId,
      template_inputs: { automation_id: "automation-1" },
      content_inputs: {},
      collection_inputs: {},
      slide_overrides: [],
    })
  })

  it("accepts nested slideshow form groups and drops operational aliases", async () => {
    configureWindmill()
    const fetchImpl = vi.fn(
      async () => new Response("job-nested", { status: 201 })
    )

    await queueWindmillWorkflow({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      workflowInput: {
        template_inputs: { automation_id: "automation-nested", hook: "saved" },
        content_inputs: { language: "en" },
        collection_inputs: { body_collection_id: "body-1" },
        slide_overrides: [{ slide_number: 2, content_direction: "keep short" }],
        generationSource: "manual",
        scheduled_for: "2026-08-21T10:00:00.000Z",
      },
      fetchImpl,
    })

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      owner_id: "owner-1",
      request_id: expect.stringMatching(/^pipeline-/),
      template_inputs: { automation_id: "automation-nested", hook: "saved" },
      content_inputs: { language: "en" },
      collection_inputs: { body_collection_id: "body-1" },
      slide_overrides: [{ slide_number: 2, content_direction: "keep short" }],
    })
  })

  it("defaults omitted slideshow collection and slide groups to empty values", async () => {
    configureWindmill()
    const fetchImpl = vi.fn(
      async () => new Response("job-defaults", { status: 201 })
    )

    await queueWindmillWorkflow({
      workflowId: "slideshow-generation",
      ownerId: "owner-1",
      workflowInput: {
        automation_id: "automation-1",
        hook: "   ",
        collection_inputs: null,
        slide_overrides: null,
      },
      fetchImpl,
    })

    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      template_inputs: { automation_id: "automation-1" },
      content_inputs: {},
      collection_inputs: {},
      slide_overrides: [],
    })
  })

  it("still rejects slideshow keys that are not aliases or form groups", async () => {
    configureWindmill()
    const fetchImpl = vi.fn()

    await expect(
      queueWindmillWorkflow({
        workflowId: "slideshow-generation",
        ownerId: "owner-1",
        workflowInput: { automationId: "automation-1", unused: true },
        fetchImpl,
      })
    ).rejects.toThrow(
      "slideshow-generation does not accept input unused. Accepted inputs: automation_id, hook, scheduled_for, generation_source"
    )
    expect(fetchImpl).not.toHaveBeenCalled()
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
        anticipationCollectionId: "reaction-clips",
        revealCollectionId: "reveal-clips",
        hookCaption: "wait for it",
        payoffCaption: "the reveal",
      },
      fetchImpl,
    })

    const request = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(request!.body))).toMatchObject({
      template_id: "react-template",
      anticipation_collection_id: "reaction-clips",
      reveal_collection_id: "reveal-clips",
      hook_caption: "wait for it",
      payoff_caption: "the reveal",
    })
  })

  it("maps the UGC actor collection without accepting the removed asset alias", async () => {
    configureWindmill()
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response("job-ugc", { status: 201 }))
    )

    await queueWindmillWorkflow({
      workflowId: "ugc-video-generation",
      ownerId: "owner-1",
      workflowInput: {
        actor: { source: "collection" },
        actorCollectionId: "actor-portraits",
      },
      fetchImpl,
    })

    const request = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(request!.body))).toMatchObject({
      actor: { source: "collection" },
      actor_collection_id: "actor-portraits",
    })

    await expect(
      queueWindmillWorkflow({
        workflowId: "ugc-video-generation",
        ownerId: "owner-1",
        workflowInput: { actorAssetCollectionId: "actor-portraits" },
        fetchImpl,
      })
    ).rejects.toThrow("does not accept input actorAssetCollectionId")
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

  it("reads queued and completed jobs from the Windmill job API", async () => {
    configureWindmill()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "job-1", type: "QueuedJob", running: true })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-1",
            type: "CompletedJob",
            success: true,
            result: { output: { run: { id: "run-1" } } },
          })
        )
      )

    await expect(
      getWindmillWorkflowJob({ jobId: "job-1", fetchImpl })
    ).resolves.toMatchObject({ id: "job-1", status: "running" })
    await expect(
      getWindmillWorkflowJob({ jobId: "job-1", fetchImpl })
    ).resolves.toMatchObject({ id: "job-1", status: "succeeded" })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://windmill.example/api/w/lumenclip/jobs_u/get/job-1?no_logs=true&no_code=true",
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  it("queues, waits, and unwraps the final stage output", async () => {
    configureWindmill()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("job-1", { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "job-1", type: "QueuedJob", running: true })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-1",
            type: "CompletedJob",
            success: true,
            result: {
              stage: { id: "x-threads-generation.generate-image" },
              output: { run: { id: "xrun-1" } },
            },
          })
        )
      )
    const sleep = vi.fn(async () => undefined)

    await expect(
      runWindmillWorkflow({
        workflowId: "x-threads-generation",
        ownerId: "owner-1",
        workflowInput: { automationId: "template-1" },
        requestId: "request-1",
        fetchImpl,
        sleep,
      })
    ).resolves.toMatchObject({
      status: "succeeded",
      jobId: "job-1",
      result: { run: { id: "xrun-1" } },
    })
    expect(sleep).toHaveBeenCalledOnce()
  })

  it("surfaces the Windmill failure message", async () => {
    configureWindmill()
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "job-1",
            type: "CompletedJob",
            success: false,
            result: { error: { name: "Error", message: "bad template" } },
          })
        )
      )
    )

    await expect(
      getWindmillWorkflowJob({ jobId: "job-1", fetchImpl })
    ).resolves.toEqual({
      id: "job-1",
      status: "failed",
      success: false,
      result: { error: { name: "Error", message: "bad template" } },
      error: "bad template",
    })
  })
})

function configureWindmill() {
  vi.stubEnv("WINDMILL_BASE_URL", "https://windmill.example")
  vi.stubEnv("WINDMILL_WORKSPACE_ID", "lumenclip")
  vi.stubEnv("WINDMILL_TOKEN", "windmill-token")
}
