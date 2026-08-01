import { describe, expect, it, vi } from "vitest"

import { createProductionPipelineHandlers } from "@/lib/mcp/production-pipeline-handlers"
import {
  createPipelineStageRegistry,
  executePipelineStage,
} from "@/lib/pipeline-executor"
import {
  PIPELINE_STAGE_CATALOG,
  type PipelineStageContext,
} from "@/lib/pipeline-stages"
import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation-payload"
import type { TempSlideTestingAutomation } from "@/lib/temp-slide-testing"

function services() {
  return {
    now: () => new Date("2026-08-01T09:00:00.000Z"),
    getAutomationRecord: vi.fn(async () => null),
    listImageCollections: vi.fn(async () => []),
    listWordCollections: vi.fn(async () => []),
    listAutomationRuns: vi.fn(async () => []),
    getXAutomation: vi.fn(async () => null),
    generateStoredXAutomationRun: vi.fn(),
    persistGeneratedXAutomationRun: vi.fn(),
    upsertXAutomationRun: vi.fn(),
    upsertXAutomation: vi.fn(async (automation) => automation),
    getReminderSettings: vi.fn(async () => ({
      events: { generated: { channel: "telegram" } },
    })),
    enqueueJob: vi.fn(async () => ({ id: "job-1", status: "queued" })),
    getJob: vi.fn(async () => null),
    ugcGenerationEnabled: () => true,
  }
}

describe("production pipeline stage handlers", () => {
  it("registers one concrete handler for every documented stage", () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    expect([...handlers.keys()]).toHaveLength(PIPELINE_STAGE_CATALOG.length)
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
      context("ugc-video-generation.synthesize-voice", handlers)
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

  it("selects one supplied slide shortlist and composes aggregate selection through that registered handler", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const singular = vi.fn(
      production.get("slideshow-generation.select-one-slide-image")!
    )
    const handlers = new Map(production)
    handlers.set("slideshow-generation.select-one-slide-image", singular)
    const registry = createPipelineStageRegistry(handlers)
    const shortlists = [
      {
        slideId: "hook-1",
        slideText: "Fixed hook",
        aiImageSelection: false,
        candidates: [
          {
            id: "image-1",
            imageUrl: "/assets/one.jpg",
            caption: "First image",
          },
        ],
      },
      {
        slideId: "content-1",
        slideText: "Body",
        aiImageSelection: false,
        candidates: [
          {
            id: "image-2",
            imageUrl: "/assets/two.jpg",
            caption: "Second image",
          },
        ],
      },
    ]

    const single = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.select-one-slide-image",
      stageInput: { shortlist: shortlists[0] },
    })
    const aggregate = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.select-slide-images",
      stageInput: { shortlists },
    })

    expect(single).toMatchObject({
      externalCalls: 0,
      output: { selectedImage: { slideId: "hook-1", id: "image-1" } },
    })
    expect(aggregate.output.selectedImages).toMatchObject([
      { slideId: "hook-1", id: "image-1" },
      { slideId: "content-1", id: "image-2" },
    ])
    expect(singular).toHaveBeenCalledTimes(3)
  })

  it("generates slide text from supplied slideshow context while preserving the fixed hook", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            native_finish_reason: "stop",
            message: {
              content: JSON.stringify({
                title: "Provider title",
                caption: "A concise provider caption.",
                hashtags: ["#workflow", "#testing"],
                text: {
                  "content-2__heading": "fixed hooks keep context stable",
                },
              }),
            },
          },
        ],
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const production = createProductionPipelineHandlers(services() as never)
    const registry = createPipelineStageRegistry(production)
    const fixedHook = "This hook must remain fixed"
    const promptPayload = slideshowTextGenerationPayload({
      automation: slideshowAutomation,
      selectedHook: fixedHook,
    })

    const execution = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.generate-slide-text-attempt",
      stageInput: {
        textAutomation: slideshowAutomation,
        hook: fixedHook,
        promptPayload,
        finalAttempt: true,
      },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(execution).toMatchObject({
      externalCalls: 1,
      output: {
        selectedHook: fixedHook,
        generatedText: {
          text: {
            "content-2__heading": "fixed hooks keep context stable",
          },
        },
      },
    })
  })

  it("resumes image generation across registered create, poll, download, and persist stages", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const createTask = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      providerTaskId: "kie-task-1",
      operation: {
        id: "kie-task-1",
        kind: "x.image.kie",
        status: "running",
      },
    }))
    const getTask = vi
      .fn<
        (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      >()
      .mockImplementationOnce(async (input) => ({
        ...input,
        operation: {
          id: "kie-task-1",
          kind: "x.image.kie",
          status: "running",
        },
      }))
      .mockImplementationOnce(async (input) => ({
        ...input,
        remoteImageUrl: "https://provider.example/image.png",
        operation: {
          id: "kie-task-1",
          kind: "x.image.kie",
          status: "succeeded",
        },
      }))
    const download = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempImagePath: "/root/.tmp-cfarm-mcp/cfarm-provider-test/image.png",
      tempImageFileName: "image.png",
    }))
    const persistAsset = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      imageUrl: "/api/local-assets/x-automations/images/image.png",
    }))
    const persist = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      persistedImageRun: true,
    }))
    const discard = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempImagePath: null,
      tempImageFileName: null,
    }))
    const handlers = new Map(production)
    handlers.set("x-threads-generation.create-image-task", createTask)
    handlers.set("x-threads-generation.get-image-task", getTask)
    handlers.set("x-threads-generation.download-image-asset", download)
    handlers.set("x-threads-generation.persist-image-asset", persistAsset)
    handlers.set("x-threads-generation.persist-image-run", persist)
    handlers.set("x-threads-generation.discard-image-temp-file", discard)
    const registry = createPipelineStageRegistry(handlers)

    const created = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "x-threads-generation.generate-image",
      stageInput: { imageTaskPayload: { model: "nano-banana-pro" } },
    })
    const polling = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "x-threads-generation.generate-image",
      stageInput: created.output,
    })
    const completed = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "x-threads-generation.generate-image",
      stageInput: polling.output,
    })

    expect(created.status).toBe("running")
    expect(polling.status).toBe("running")
    expect(completed).toMatchObject({
      status: "succeeded",
      output: {
        providerTaskId: "kie-task-1",
        remoteImageUrl: "https://provider.example/image.png",
        imageUrl: "/api/local-assets/x-automations/images/image.png",
        persistedImageRun: true,
      },
    })
    expect(createTask).toHaveBeenCalledOnce()
    expect(getTask).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledOnce()
    expect(persistAsset).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    expect(discard).toHaveBeenCalledOnce()
  })

  it("generates one b-roll item through singular registered async boundaries", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const create = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      providerRequestId: "fal-task-1",
    }))
    const status = vi
      .fn<
        (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      >()
      .mockImplementationOnce(async (input) => ({
        ...input,
        falStatus: { status: "IN_PROGRESS" },
      }))
      .mockImplementationOnce(async (input) => ({
        ...input,
        falStatus: { status: "COMPLETED" },
      }))
    const result = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      providerAsset: { url: "https://provider.example/broll.png" },
      operation: { id: "fal-task-1", status: "succeeded" },
    }))
    const download = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempBrollPath: "/root/.tmp-cfarm-mcp/cfarm-provider-test/broll.png",
      tempBrollFileName: "broll.png",
    }))
    const persist = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      brollUrl: "/api/local-assets/ugc-automations/broll/broll.png",
    }))
    const discard = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempBrollPath: null,
    }))
    const handlers = new Map(production)
    handlers.set("ugc-video-generation.fal-create-task", create)
    handlers.set("ugc-video-generation.fal-get-task-status", status)
    handlers.set("ugc-video-generation.fal-get-task-result", result)
    handlers.set("ugc-video-generation.download-one-broll-asset", download)
    handlers.set("ugc-video-generation.persist-one-broll-asset", persist)
    handlers.set("ugc-video-generation.discard-broll-temp-file", discard)
    const registry = createPipelineStageRegistry(handlers)

    const created = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.generate-one-broll-image",
      stageInput: {
        endpoint: "fal-ai/flux-2-pro",
        providerInput: { prompt: "One product close-up" },
      },
    })
    const polling = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.generate-one-broll-image",
      stageInput: created.output,
    })
    const completed = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.generate-one-broll-image",
      stageInput: polling.output,
    })

    expect(created.status).toBe("running")
    expect(polling.status).toBe("running")
    expect(completed).toMatchObject({
      status: "succeeded",
      output: {
        providerRequestId: "fal-task-1",
        brollUrl: "/api/local-assets/ugc-automations/broll/broll.png",
      },
    })
    expect(create).toHaveBeenCalledOnce()
    expect(status).toHaveBeenCalledTimes(2)
    expect(result).toHaveBeenCalledOnce()
    expect(download).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    expect(discard).toHaveBeenCalledOnce()
  })

  it("resumes slideshow Rendi across upload, submit, poll, download, and persistence stages", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const prepare = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      slideshowId: "slideshow-1",
      slideshowVideoPreparation: {
        resultId: "result-1",
        thumbnailPath:
          "/root/.tmp-cfarm-mcp/cfarm-slideshow-video-test/thumb.png",
      },
      rendiLocalInputs: [
        {
          alias: "slide_0",
          fileName: "slide-1.png",
          localFilePath:
            "/root/.tmp-cfarm-mcp/cfarm-slideshow-video-test/slide-1.png",
        },
      ],
    }))
    const upload = vi
      .fn<
        (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      >()
      .mockImplementationOnce(async (input) => ({
        ...input,
        rendiUpload: {
          fileId: "file-1",
          uploadSessionPath:
            "/root/.tmp-cfarm-mcp/cfarm-rendi-upload-test/session.json",
          phase: "uploading",
        },
        operation: { id: "file-1", status: "running" },
      }))
      .mockImplementationOnce(async (input) => ({
        ...input,
        rendiUpload: {
          fileId: "file-1",
          uploadSessionPath:
            "/root/.tmp-cfarm-mcp/cfarm-rendi-upload-test/session.json",
          storageUrl: "https://rendi.example/slide-1.png",
          phase: "complete",
        },
        operation: { id: "file-1", status: "succeeded" },
      }))
    const build = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      rendiCommandRequest: {
        ffmpegCommand: "ffmpeg ...",
        inputFiles: { slide_0: "https://rendi.example/slide-1.png" },
        outputFiles: { out_video: "slideshow-export.mp4" },
      },
    }))
    const submit = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      rendiCommandId: "command-1",
      operation: { id: "command-1", status: "running" },
    }))
    const poll = vi
      .fn<
        (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      >()
      .mockImplementationOnce(async (input) => ({
        ...input,
        operation: { id: "command-1", status: "running" },
      }))
      .mockImplementationOnce(async (input) => ({
        ...input,
        rendiOutputUrls: {
          out_video: "https://rendi.example/slideshow.mp4",
        },
        operation: { id: "command-1", status: "succeeded" },
      }))
    const download = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempRendiOutputPath:
        "/root/.tmp-cfarm-mcp/cfarm-provider-test/slideshow.mp4",
    }))
    const persist = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      persistedRendiOutputUrl:
        input.outputKind === "thumbnail"
          ? "/assets/slideshow/thumbnail.png"
          : "/assets/slideshow/video.mp4",
    }))
    const discard = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempRendiOutputPath: null,
      uploadSessionPath: null,
    }))
    const finalize = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      operation: { id: "command-1", status: "succeeded" },
    }))
    const handlers = new Map(production)
    handlers.set("slideshow-generation.prepare-video-render", prepare)
    handlers.set("slideshow-generation.rendi-upload-file", upload)
    handlers.set("slideshow-generation.build-rendi-video-command", build)
    handlers.set("slideshow-generation.rendi-submit-command", submit)
    handlers.set("slideshow-generation.rendi-get-command", poll)
    handlers.set("slideshow-generation.rendi-download-output", download)
    handlers.set("slideshow-generation.rendi-persist-output", persist)
    handlers.set("slideshow-generation.rendi-discard-temp", discard)
    handlers.set("slideshow-generation.finalize-video-render", finalize)
    const registry = createPipelineStageRegistry(handlers)

    const first = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.render-store-mp4",
      stageInput: { plan: { publishType: "video" } },
    })
    const second = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.render-store-mp4",
      stageInput: first.output,
    })
    const third = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.render-store-mp4",
      stageInput: second.output,
    })
    const completed = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.render-store-mp4",
      stageInput: third.output,
    })

    expect([
      first.status,
      second.status,
      third.status,
      completed.status,
    ]).toEqual(["running", "running", "running", "succeeded"])
    expect(completed.output).toMatchObject({
      videoUrl: "/assets/slideshow/video.mp4",
      thumbnailUrl: "/assets/slideshow/thumbnail.png",
    })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledOnce()
    expect(poll).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledOnce()
  })

  it("resumes a UGC Rendi composite without repeating completed boundaries", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const upload = vi
      .fn<
        (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      >()
      .mockImplementationOnce(async (input) => ({
        ...input,
        rendiUpload: { fileId: "actor-1", phase: "uploading" },
        operation: { id: "actor-1", status: "running" },
      }))
      .mockImplementationOnce(async (input) => ({
        ...input,
        rendiUpload: {
          fileId: "actor-1",
          phase: "complete",
          storageUrl: "https://rendi.example/actor.mp4",
        },
        operation: { id: "actor-1", status: "succeeded" },
      }))
    const submit = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      rendiCommandId: "ugc-command-1",
      operation: { id: "ugc-command-1", status: "running" },
    }))
    const poll = vi
      .fn<
        (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      >()
      .mockImplementationOnce(async (input) => ({
        ...input,
        operation: { id: "ugc-command-1", status: "running" },
      }))
      .mockImplementationOnce(async (input) => ({
        ...input,
        rendiOutputUrls: {
          "output.mp4": "https://rendi.example/output.mp4",
          "thumbnail.jpg": "https://rendi.example/thumbnail.jpg",
        },
        operation: { id: "ugc-command-1", status: "succeeded" },
      }))
    const download = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempRendiOutputPath: `/root/.tmp-cfarm-mcp/cfarm-provider-test/${String(input.outputFileName)}`,
    }))
    const persist = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      persistedRendiOutputUrl: `/assets/ugc/${String(input.outputKind)}`,
    }))
    const discard = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempRendiOutputPath: null,
      uploadSessionPath: null,
    }))
    const handlers = new Map(production)
    handlers.set("ugc-video-generation.rendi-upload-file", upload)
    handlers.set("ugc-video-generation.rendi-submit-command", submit)
    handlers.set("ugc-video-generation.rendi-get-command", poll)
    handlers.set("ugc-video-generation.rendi-download-output", download)
    handlers.set("ugc-video-generation.rendi-persist-output", persist)
    handlers.set("ugc-video-generation.rendi-discard-temp", discard)
    const registry = createPipelineStageRegistry(handlers)
    const initial = {
      automationId: "ugc-1",
      runId: "run-1",
      rendiLocalInputs: [
        {
          alias: "actor.mp4",
          fileName: "actor.mp4",
          localFilePath: "/root/.tmp-cfarm-mcp/cfarm-provider-test/actor.mp4",
        },
      ],
      rendiCommandRequest: {
        ffmpegCommand: "ffmpeg ...",
        inputFiles: {},
        outputFiles: {
          "output.mp4": "output.mp4",
          "thumbnail.jpg": "thumbnail.jpg",
        },
      },
      rendiOutputSpecs: [
        { alias: "output.mp4", fileName: "output.mp4", outputKind: "video" },
        {
          alias: "thumbnail.jpg",
          fileName: "thumbnail.jpg",
          outputKind: "thumbnail",
        },
      ],
    }

    const first = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.render-rendi-composite",
      stageInput: initial,
    })
    const second = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.render-rendi-composite",
      stageInput: first.output,
    })
    const third = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.render-rendi-composite",
      stageInput: second.output,
    })
    const completed = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.render-rendi-composite",
      stageInput: third.output,
    })

    expect([
      first.status,
      second.status,
      third.status,
      completed.status,
    ]).toEqual(["running", "running", "running", "succeeded"])
    expect(completed.output).toMatchObject({
      videoUrl: "/assets/ugc/video",
      thumbnailUrl: "/assets/ugc/thumbnail",
    })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledOnce()
    expect(poll).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it("resumes ElevenLabs persistence without synthesizing a second time", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const synthesize = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempVoiceAudioPath:
        "/root/.tmp-cfarm-mcp/cfarm-elevenlabs-test/voice.mp3",
      tempVoiceTimingsPath:
        "/root/.tmp-cfarm-mcp/cfarm-elevenlabs-test/word-timings.json",
    }))
    const audio = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      voiceAudioUrl: "/assets/ugc/voice.mp3",
    }))
    const timings = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      voiceTimingsUrl: "/assets/ugc/word-timings.json",
    }))
    const discard = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      tempVoiceAudioPath: null,
      tempVoiceTimingsPath: null,
    }))
    const handlers = new Map(production)
    handlers.set(
      "ugc-video-generation.elevenlabs-synthesize-speech",
      synthesize
    )
    handlers.set("ugc-video-generation.persist-voice-audio", audio)
    handlers.set("ugc-video-generation.persist-voice-timings", timings)
    handlers.set("ugc-video-generation.discard-voice-temp", discard)
    const registry = createPipelineStageRegistry(handlers)

    const resumed = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "ugc-video-generation.synthesize-voice-assets",
      stageInput: {
        automationId: "ugc-1",
        runId: "run-1",
        tempVoiceAudioPath:
          "/root/.tmp-cfarm-mcp/cfarm-elevenlabs-test/voice.mp3",
        tempVoiceTimingsPath:
          "/root/.tmp-cfarm-mcp/cfarm-elevenlabs-test/word-timings.json",
      },
    })

    expect(resumed.output).toMatchObject({
      voiceAudioUrl: "/assets/ugc/voice.mp3",
      voiceTimingsUrl: "/assets/ugc/word-timings.json",
    })
    expect(synthesize).not.toHaveBeenCalled()
    expect(audio).toHaveBeenCalledOnce()
    expect(timings).toHaveBeenCalledOnce()
    expect(discard).toHaveBeenCalledOnce()
  })
})

const slideshowAutomation: TempSlideTestingAutomation = {
  id: "atomic-slideshow",
  name: "Atomic slideshow",
  theme: "workflow testing",
  hooks: ["This hook must remain fixed"],
  tone: "Educational & Informative",
  imageCollectionIds: { hook: "", content: "", cta: "" },
  slides: [
    {
      id: "hook-1",
      index: 0,
      section: "hook",
      title: "Hook",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: true,
      displayText: true,
      collectionId: "",
      textItems: [],
    },
    {
      id: "content-2",
      index: 1,
      section: "content",
      title: "Content",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: true,
      displayText: true,
      collectionId: "",
      textItems: [
        {
          id: "content-2__heading",
          itemId: "heading",
          section: "content",
          slideId: "content-2",
          label: "Heading",
          contentDirection: "Explain why fixed hooks matter",
          wordLengthMin: 3,
          wordLengthMax: 8,
          textMode: "prompt",
          staticText: "",
          font: "TikTok Display Medium",
          fontSize: "12px",
          textStyle: "whiteText",
          textPosition: "center",
          textItemWidth: "80%",
          textAlign: "left",
          textAnchor: "flush",
          textVerticalAnchor: "padded",
        },
      ],
    },
  ],
}

function context(
  stageId: string,
  handlers?: ReturnType<typeof createProductionPipelineHandlers>
): PipelineStageContext {
  return {
    ownerId: "owner-1",
    workflowId: stageId.split(".")[0] as never,
    stageId,
    requestId: "request-1",
    runStage: async (
      nestedStageId: string,
      input: Record<string, unknown>
    ) => ({
      stage: {} as never,
      requestId: "request-1",
      status: "succeeded" as const,
      externalCalls: 0,
      output: await handlers!.get(nestedStageId)!(
        input,
        context(nestedStageId, handlers)
      ),
    }),
    externalCall: async <T>(
      _operation: string,
      task: () => Promise<T>
    ): Promise<T> => task(),
  }
}
