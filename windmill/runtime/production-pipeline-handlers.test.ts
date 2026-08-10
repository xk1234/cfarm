import { describe, expect, it, vi } from "vitest"

import { createProductionPipelineHandlers } from "./production-pipeline-handlers"
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
import { defaultAutomationSchema } from "@/lib/realfarm-automation"

function services() {
  return {
    now: () => new Date("2026-08-01T09:00:00.000Z"),
    getAutomationRecord: vi.fn(async () => null),
    listImageCollections: vi.fn(async () => []),
    listWordCollections: vi.fn(async () => []),
    listAutomationRuns: vi.fn(async () => []),
    getXAutomation: vi.fn(async () => null),
    upsertXAutomationRun: vi.fn(),
    upsertXAutomation: vi.fn(async (automation) => automation),
    getReminderSettings: vi.fn(async () => ({
      events: { generated: { channel: "telegram" } },
    })),
    sendGeneratedReminder: vi.fn(async () => ({ sent: true })),
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

  it("paginates collections only through the registered singular page stage", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const page = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      storagePage:
        typeof input.cursor === "string" && input.cursor.length > 0
          ? {
              records: [
                {
                  rowId: "collection-2",
                  record: {
                    name: "Second",
                    created_at: "2026-08-01",
                    images: [],
                  },
                },
              ],
              nextCursor: null,
            }
          : {
              records: [
                {
                  rowId: "collection-1",
                  record: {
                    name: "First",
                    created_at: "2026-08-01",
                    images: [],
                  },
                },
              ],
              nextCursor: "collection-1",
            },
    }))
    const handlers = new Map(production)
    handlers.set("slideshow-generation.list-image-collections-page", page)
    const result = await executePipelineStage({
      registry: createPipelineStageRegistry(handlers),
      ownerId: "owner-1",
      stageId: "slideshow-generation.list-image-collections",
      stageInput: {},
    })

    expect(result.externalCalls).toBe(0)
    expect(result.output.collections).toHaveLength(2)
    expect(page).toHaveBeenCalledTimes(2)
  })

  it("returns bounded media collection options without asset URLs", async () => {
    const handlers = new Map(
      createProductionPipelineHandlers(services() as never)
    )
    handlers.set(
      "slideshow-generation.list-image-collections",
      vi.fn(async () => ({
        collections: [
          {
            id: "clips",
            name: "Clips",
            mediaType: "video",
            created_at: "2026-08-01T00:00:00.000Z",
            images: [{ image_link: "https://cdn.test/clip.mp4", caption: "" }],
          },
          {
            id: "photos",
            name: "Photos",
            created_at: "2026-08-01T00:00:00.000Z",
            images: [{ image_link: "https://cdn.test/photo.jpg", caption: "" }],
          },
        ],
      }))
    )

    const result = await handlers.get(
      "slideshow-generation.list-media-collection-options"
    )!(
      { mediaKind: "video" },
      context("slideshow-generation.list-media-collection-options", handlers)
    )

    expect(result).toEqual({
      options: [
        {
          value: "clips",
          label: "Clips (1)",
          mediaKind: "video",
          assetCount: 1,
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain("cdn.test")
  })

  it("applies slideshow run overrides without mutating the saved template", async () => {
    const schema = defaultAutomationSchema({
      id: "template-1",
      name: "Astrology Informational",
      status: "live",
      account: "",
      handle: "",
      times: [],
      favorite: false,
      theme: "default",
      socialIntegrations: [],
      automationKind: "slideshow",
    })
    schema.hooks = [
      {
        id: "hook-1",
        text: "A saved astrology hook",
        enabled: true,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]
    schema.image_collection_ids.first_slide.collection = "base"
    schema.image_collection_ids.all_slides = "base"
    schema.slide_designs = schema.slide_designs.map((design) => ({
      ...design,
      collectionId: "base",
    }))
    const original = structuredClone(schema)
    const collection = (id: string) => ({
      id,
      name: id,
      created_at: "2026-08-01T00:00:00.000Z",
      images: [{ image_link: `https://cdn.test/${id}.jpg`, caption: id }],
    })
    const handlers = createProductionPipelineHandlers(services() as never)
    const output = await handlers.get("slideshow-generation.validate-input")!(
      {
        schema,
        collections: [
          collection("base"),
          collection("hook-new"),
          collection("body-new"),
          collection("cta-new"),
          collection("slide-new"),
        ],
        wordCollections: [],
        contentControls: {
          language: "Spanish",
          tone: "Direct and playful",
          slide_count: 4,
          hook_content_direction: "Open with a surprising zodiac contrast.",
          body_content_direction:
            "Explain the contrast with concrete examples.",
          cta_content_direction: "Ask readers which sign they are.",
        },
        collectionOverrides: {
          hook_collection_id: "hook-new",
          body_collection_id: "body-new",
          cta_collection_id: "cta-new",
        },
        slideOverrides: [
          {
            slide_number: 2,
            content_direction: "Make this slide about Leo specifically.",
            collection_id: "slide-new",
          },
        ],
      },
      context("slideshow-generation.validate-input", handlers)
    )

    expect(schema).toEqual(original)
    expect(output.schema).toMatchObject({
      language: "Spanish",
      tone: { value: "Direct and playful", preset: "custom" },
      prompt_formatting: { num_of_slides: 4 },
      image_collection_ids: {
        first_slide: {
          collection: "hook-new",
          mode: "collection",
          single_image: null,
        },
        all_slides: "body-new",
        cta_slide: {
          check: true,
          cta_collection_id: "cta-new",
          image_id: null,
        },
      },
    })
    expect(output.textAutomation.slides).toHaveLength(4)
    expect(output.textAutomation.slides[1]).toMatchObject({
      collectionId: "slide-new",
      textItems: [
        expect.objectContaining({
          contentDirection: "Make this slide about Leo specifically.",
        }),
      ],
    })
    expect(output.appliedOverrides).toMatchObject({
      collectionOverrides: {
        hook: "hook-new",
        body: "body-new",
        cta: "cta-new",
      },
      slideOverrides: [
        {
          slide_number: 2,
          content_direction: "Make this slide about Leo specifically.",
          collection_id: "slide-new",
        },
      ],
    })
  })

  it("persists an X run by composing registered read, create, and media stages", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const visited: string[] = []
    const handlers = new Map(production)
    for (const id of [
      "x-threads-generation.prepare-run-document",
      "x-threads-generation.get-run-document",
      "x-threads-generation.create-run-document",
      "x-threads-generation.persist-run-media",
    ]) {
      handlers.set(
        id,
        vi.fn(async (input: Record<string, unknown>) => {
          visited.push(id)
          if (id.endsWith("prepare-run-document"))
            return { ...input, runId: "run-1", runRowId: "row-1", runMedia: [] }
          if (id.endsWith("get-run-document"))
            return { ...input, xRunDocument: null }
          return input
        })
      )
    }
    const result = await executePipelineStage({
      registry: createPipelineStageRegistry(handlers),
      ownerId: "owner-1",
      stageId: "x-threads-generation.persist-run",
      stageInput: { run: { id: "run-1" } },
    })

    expect(result.externalCalls).toBe(0)
    expect(visited).toEqual([
      "x-threads-generation.prepare-run-document",
      "x-threads-generation.get-run-document",
      "x-threads-generation.create-run-document",
      "x-threads-generation.persist-run-media",
    ])
  })

  it("resumes a saved UGC checkpoint through registered get and update stages", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const get = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      savedRunDocument: { rowId: "run-row", record: input.savedRun },
    }))
    const update = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      persistedSavedRun: { rowId: "run-row" },
    }))
    const create = vi.fn()
    const handlers = new Map(production)
    handlers.set("ugc-video-generation.get-saved-run-document", get)
    handlers.set("ugc-video-generation.update-saved-run-document", update)
    handlers.set("ugc-video-generation.create-saved-run-document", create)
    const result = await executePipelineStage({
      registry: createPipelineStageRegistry(handlers),
      ownerId: "owner-1",
      stageId: "ugc-video-generation.save-checkpoint",
      stageInput: {
        runId: "ugc-run-1",
        savedRun: {
          id: "ugc-run-1",
          checkpoints: { voice: { status: "complete" } },
        },
      },
    })

    expect(result.externalCalls).toBe(0)
    expect(get).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
  })

  it("persists supplied UGC final output only through registered storage children", async () => {
    const production = createProductionPipelineHandlers(services() as never)
    const visited: string[] = []
    const handlers = new Map(production)
    for (const id of [
      "ugc-video-generation.prepare-final-output-document",
      "ugc-video-generation.get-final-output-document",
      "ugc-video-generation.create-final-output-document",
      "ugc-video-generation.persist-final-output-media",
      "ugc-video-generation.create-generated-notification-job",
    ]) {
      handlers.set(
        id,
        vi.fn(async (input: Record<string, unknown>) => {
          visited.push(id)
          if (id.endsWith("prepare-final-output-document")) {
            return {
              ...input,
              outputId: "ugc-output-1",
              outputRowId: "output-row-1",
              outputMedia: [],
              runId: "ugc-run-1",
            }
          }
          if (id.endsWith("get-final-output-document")) {
            return { ...input, finalOutputDocument: null }
          }
          return input
        })
      )
    }

    const result = await executePipelineStage({
      registry: createPipelineStageRegistry(handlers),
      ownerId: "owner-1",
      stageId: "ugc-video-generation.persist-final-output",
      stageInput: { finalOutput: { id: "ugc-output-1" } },
    })

    expect(result.externalCalls).toBe(0)
    expect(visited).toEqual([
      "ugc-video-generation.prepare-final-output-document",
      "ugc-video-generation.get-final-output-document",
      "ugc-video-generation.create-final-output-document",
      "ugc-video-generation.persist-final-output-media",
      "ugc-video-generation.create-generated-notification-job",
    ])
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

  it("rejects the removed in-process UGC checkpoint queue", async () => {
    const runtime = services()
    const handlers = createProductionPipelineHandlers(runtime as never)
    const handler = handlers.get("ugc-video-generation.synthesize-voice")!
    await expect(
      handler(
        {
          automationId: "ugc-automation-1",
          scheduledFor: "2026-08-01T09:00:00.000Z",
        },
        context("ugc-video-generation.synthesize-voice", handlers)
      )
    ).rejects.toThrow("native Windmill runtime")
    expect(runtime.sendGeneratedReminder).not.toHaveBeenCalled()
  })

  it("does not expose the removed monolithic component resolvers", () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    expect(handlers.has("ugc-video-generation.resolve-components")).toBe(false)
    expect(handlers.has("react-reveal-generation.resolve-components")).toBe(
      false
    )
    expect(handlers.has("greenscreen-meme-generation.resolve-components")).toBe(
      false
    )
  })

  it("resolves UGC components independently from one loaded template artifact", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const generation = {
      templateId: null,
      generationId: "ugc-1",
      scheduledFor: "2026-08-01T09:00:00.000Z",
    }
    const product = await handlers.get(
      "ugc-video-generation.resolve-product-component"
    )!(
      {
        generation,
        templateDefaults: { productBrief: "Template brief" },
        override: { url: "https://product.test/item" },
      },
      context("ugc-video-generation.resolve-product-component", handlers)
    )
    const script = await handlers.get(
      "ugc-video-generation.resolve-script-component"
    )!(
      {
        generation,
        templateDefaults: { targetDurationSeconds: 240 },
        override: {},
      },
      context("ugc-video-generation.resolve-script-component", handlers)
    )

    expect(product).toEqual({
      generation,
      componentRole: "product",
      component: {
        url: "https://product.test/item",
        brief: "Template brief",
      },
    })
    expect(script).toEqual({
      generation,
      componentRole: "script",
      component: { targetDurationSeconds: 180 },
    })
  })

  it("resolves a collection actor from an image collection", async () => {
    const handlers = new Map(
      createProductionPipelineHandlers(services() as never)
    )
    handlers.set(
      "slideshow-generation.list-image-collections",
      vi.fn(async () => ({
        collections: [
          {
            id: "actor-portraits",
            name: "Actor portraits",
            created_at: "2026-08-01T00:00:00.000Z",
            images: [
              { image_link: "https://cdn.test/portrait.png", caption: "" },
            ],
          },
        ],
      }))
    )

    const output = await handlers.get(
      "ugc-video-generation.resolve-actor-component"
    )!(
      {
        generation: { generationId: "ugc-1" },
        templateDefaults: {},
        override: {
          source: "collection",
          collectionId: "actor-portraits",
        },
      },
      context("ugc-video-generation.resolve-actor-component", handlers)
    )

    expect(output).toMatchObject({
      component: {
        source: "collection",
        collectionId: "actor-portraits",
        portraitUrl: "https://cdn.test/portrait.png",
      },
    })
  })

  it("creates an isolated typed UGC performance join", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const output = await handlers.get(
      "ugc-video-generation.assemble-performance"
    )!(
      {
        voice: { audioUrl: "https://cdn.test/voice.mp3" },
        lipsync: { videoUrl: "https://cdn.test/lipsync.mp4" },
      },
      context("ugc-video-generation.assemble-performance", handlers)
    )

    expect(output).toEqual({
      performance: {
        voice: { audioUrl: "https://cdn.test/voice.mp3" },
        lipsync: { videoUrl: "https://cdn.test/lipsync.mp4" },
      },
    })
  })

  it("resolves fixed video and photo inputs from matching collections", async () => {
    const handlers = new Map(
      createProductionPipelineHandlers(services() as never)
    )
    handlers.set(
      "slideshow-generation.list-image-collections",
      vi.fn(async () => ({
        collections: [
          {
            id: "meme-clips",
            name: "Meme clips",
            mediaType: "video",
            created_at: "2026-08-01T00:00:00.000Z",
            images: [{ image_link: "https://cdn.test/meme.mp4", caption: "" }],
          },
          {
            id: "backgrounds",
            name: "Backgrounds",
            created_at: "2026-08-01T00:00:00.000Z",
            images: [
              { image_link: "https://cdn.test/background.jpg", caption: "" },
            ],
          },
        ],
      }))
    )

    const meme = await handlers.get(
      "greenscreen-meme-generation.resolve-meme"
    )!(
      {
        generation: { outputId: "output-1" },
        templateDefaults: {},
        override: { collectionId: "meme-clips" },
      },
      context("greenscreen-meme-generation.resolve-meme", handlers)
    )
    const background = await handlers.get(
      "greenscreen-meme-generation.resolve-background"
    )!(
      {
        generation: { outputId: "output-1" },
        templateDefaults: {},
        override: { collectionId: "backgrounds" },
      },
      context("greenscreen-meme-generation.resolve-background", handlers)
    )

    expect(meme).toMatchObject({
      component: {
        collectionId: "meme-clips",
        url: "https://cdn.test/meme.mp4",
      },
    })
    expect(background).toMatchObject({
      component: {
        collectionId: "backgrounds",
        url: "https://cdn.test/background.jpg",
      },
    })
  })

  it("rejects raw fixed-video URLs while normalizing output metadata", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const generation = { outputId: "video-1" }
    await expect(
      handlers.get("react-reveal-generation.resolve-anticipation")!(
        {
          generation,
          templateDefaults: {},
          override: { url: "https://cdn.test/anticipation.mp4" },
        },
        context("react-reveal-generation.resolve-anticipation", handlers)
      )
    ).rejects.toThrow("anticipation component requires a media collection")
    const output = await handlers.get(
      "react-reveal-generation.resolve-output"
    )!(
      {
        generation,
        templateDefaults: {},
        override: { title: "The reveal", hashtags: ["#demo"] },
      },
      context("react-reveal-generation.resolve-output", handlers)
    )
    expect(output).toEqual({
      generation,
      componentRole: "output",
      component: {
        title: "The reveal",
        description: undefined,
        hashtags: ["#demo"],
      },
    })
  })

  it("normalizes LinkedIn groups before their first common consumer", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const audience = await handlers.get(
      "linkedin-generation.normalize-audience-topic"
    )!(
      {
        niche: "Creator analytics",
        topic: " retention ",
        excludedTopics: ["AI"],
      },
      context("linkedin-generation.normalize-audience-topic", handlers)
    )
    const batch = await handlers.get(
      "linkedin-generation.normalize-batch-controls"
    )!(
      { count: 99 },
      context("linkedin-generation.normalize-batch-controls", handlers)
    )

    expect(audience).toEqual({
      audience: {
        niche: "Creator analytics",
        topic: "retention",
        excludedTopics: ["AI"],
      },
    })
    expect(batch).toEqual({ batchControls: { count: 4 } })
  })

  it("normalizes X/Threads run input without loading its template", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const output = await handlers.get(
      "x-threads-generation.normalize-run-input"
    )!(
      {
        requestId: "request-1",
        topic: "  Saturn return  ",
        sourceCandidate: {
          source: "x",
          url: "https://x.com/example/status/1",
          author: "@example",
          text: "Saturn return is a reset, not a punishment.",
        },
      },
      context("x-threads-generation.normalize-run-input", handlers)
    )

    expect(output).toEqual({
      runInput: {
        topic: "Saturn return",
        sourceCandidate: {
          id: "manual-request-1",
          source: "x",
          url: "https://x.com/example/status/1",
          author: "@example",
          text: "Saturn return is a reset, not a punishment.",
          mediaUrls: [],
          metrics: { views: 0, likes: 0, replies: 0, reposts: 0 },
          engagementRate: 0,
          relevanceScore: 0,
          reason: "Manually supplied reaction source",
        },
        deriveBrief: true,
      },
    })
  })

  it("prepares slideshow image pools without generated text", async () => {
    const handlers = createProductionPipelineHandlers(services() as never)
    const output = await handlers.get(
      "slideshow-generation.prepare-image-candidate-pools"
    )!(
      {
        textAutomation: {
          slides: [
            {
              id: "hook-1",
              collectionId: "Hooks",
              aiImageSelection: true,
            },
          ],
        },
        collections: [
          {
            id: "collection-1",
            name: "Hooks",
            images: [
              {
                hash: "image-1",
                image_link: "/assets/hook.jpg",
                caption: "Night sky",
              },
            ],
          },
        ],
      },
      context("slideshow-generation.prepare-image-candidate-pools", handlers)
    )

    expect(output).toEqual({
      candidatesBySlide: [
        {
          slideId: "hook-1",
          aiImageSelection: true,
          candidates: [
            {
              id: "image-1",
              imageUrl: "/assets/hook.jpg",
              caption: "Night sky",
            },
          ],
        },
      ],
      candidatePoolCount: 1,
    })
    expect(JSON.stringify(output)).not.toContain("generatedText")
  })

  it("does not allow an exact UGC component to escape into Appwrite", async () => {
    const runtime = services()
    const handlers = createProductionPipelineHandlers(runtime as never)
    const handler = handlers.get("ugc-video-generation.synthesize-voice")!
    const scriptCheckpoint = { plan: { hook: "Hook", segments: [] } }

    await expect(
      handler(
        {
          componentExecution: true,
          generationId: "debug-run-1",
          scheduledFor: "2026-08-01T09:00:00.000Z",
          components: { voice: { voiceId: "voice-1" } },
          checkpoints: { script: scriptCheckpoint },
        },
        context("ugc-video-generation.synthesize-voice", handlers)
      )
    ).rejects.toThrow("native Windmill runtime")
    expect(runtime.sendGeneratedReminder).not.toHaveBeenCalled()
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
