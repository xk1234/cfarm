import { describe, expect, it, vi } from "vitest"

import { createProductionPipelineHandlers } from "@/lib/mcp/production-pipeline-handlers"
import { PIPELINE_STAGE_CATALOG } from "@/lib/pipeline-stages"

function services() {
  return {
    now: () => new Date("2026-08-01T09:00:00.000Z"),
    getAutomationRecord: vi.fn(async () => null),
    listImageCollections: vi.fn(async () => []),
    listWordCollections: vi.fn(async () => []),
    getXAutomation: vi.fn(async () => null),
    generateStoredXAutomationRun: vi.fn(),
    persistGeneratedXAutomationRun: vi.fn(),
    upsertXAutomationRun: vi.fn(),
    enqueueJob: vi.fn(async () => ({ id: "job-1", status: "queued" })),
    getJob: vi.fn(async () => null),
    ugcGenerationEnabled: () => true,
  }
}

describe("production pipeline stage handlers", () => {
  it("registers one concrete handler for every documented stage", () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    expect([...handlers.keys()]).toHaveLength(45)
    expect([...handlers.keys()].sort()).toEqual(
      PIPELINE_STAGE_CATALOG.map((stage) => stage.id).sort()
    )
  })

  it("normalizes LinkedIn input as a standalone deterministic stage", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const handler = handlers.get("linkedin-generation.validate-input")!
    const output = await handler(
      {
        niche: "B2B SaaS onboarding",
        persona: "practitioner",
        count: 99,
        proof: ["Reduced activation time from 9 days to 3 days"],
      },
      context("linkedin-generation.validate-input")
    )
    expect(output).toEqual({
      normalizedInput: expect.objectContaining({
        niche: "B2B SaaS onboarding",
        persona: "practitioner",
        count: 4,
      }),
      validationErrors: [],
    })
  })

  it("queues the exact requested UGC checkpoint stage without media input", async () => {
    const runtime = services()
    const handlers = createProductionPipelineHandlers(runtime as never)
    const handler = handlers.get("ugc-video-generation.synthesize-voice")!
    const output = await handler(
      {
        automationId: "ugc-automation-1",
        scheduledFor: "2026-08-01T09:00:00.000Z",
      },
      context("ugc-video-generation.synthesize-voice")
    )

    expect(runtime.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run-ugc-automation",
        payload: expect.objectContaining({
          automationId: "ugc-automation-1",
          stopAfter: "voice",
          draftOnly: true,
        }),
      })
    )
    expect(output).toMatchObject({
      automationId: "ugc-automation-1",
      scheduledFor: "2026-08-01T09:00:00.000Z",
      operation: { id: "job-1", status: "running", kind: "ugc.stage.voice" },
    })
    expect(JSON.stringify(output)).not.toContain("base64")
  })

  it("keeps a pinned slideshow image inside a bounded shortlist", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const handler = handlers.get("slideshow-generation.build-image-shortlists")!
    const output = await handler(
      {
        textAutomation: {
          slides: [
            {
              id: "hook-1",
              section: "hook",
              aiImageSelection: true,
              textItems: [{ id: "hook-text", textMode: "prompt" }],
            },
          ],
        },
        hook: "Why Cancer goes quiet",
        generatedText: { text: {} },
        visualConceptsBySlide: [
          { slideId: "hook-1", concepts: ["quiet blue room"] },
        ],
        candidatesBySlide: [
          {
            slideId: "hook-1",
            slideText: "Why Cancer goes quiet",
            aiImageSelection: true,
            candidates: [
              {
                id: "ranked-image",
                imageUrl: "/assets/ranked.jpg",
                caption: "Quiet blue room",
              },
              {
                id: "pinned-image",
                imageUrl: "/assets/pinned.jpg",
                caption: "Unrelated but explicitly pinned",
              },
            ],
          },
        ],
        firstSlidePinnedImageId: "pinned-image",
        shortlistLimit: 1,
      },
      context("slideshow-generation.build-image-shortlists")
    )

    expect(output).toMatchObject({
      shortlists: [
        {
          slideId: "hook-1",
          candidates: [{ id: "pinned-image", index: 0 }],
        },
      ],
    })
  })
})

function context(stageId: string) {
  return {
    ownerId: "owner-1",
    workflowId: stageId.split(".")[0] as never,
    stageId,
    requestId: "request-1",
    runStage: vi.fn(),
  }
}
