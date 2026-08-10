import { describe, expect, it, vi } from "vitest"

import {
  createPipelineStageRegistry,
  executePipelineStage,
  pipelineCatalog,
  type PipelineHandlerMap,
} from "@/lib/pipeline-executor"
import { PIPELINE_STAGE_CATALOG } from "@/lib/pipeline-stages"
import { recordProviderRequest } from "@/lib/provider-request-trace"

function handlers(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return new Map(
    PIPELINE_STAGE_CATALOG.map((stage) => [
      stage.id,
      overrides[stage.id] ??
        vi.fn(async (input: Record<string, unknown>) => ({
          ...input,
          visited: [
            ...(Array.isArray(input.visited) ? input.visited : []),
            stage.id,
          ],
        })),
    ])
  ) as PipelineHandlerMap
}

describe("production pipeline executor", () => {
  it("executes one exact registered handler", async () => {
    const first = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      selectedHook: "Why Cancer goes quiet",
    }))
    const second = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      researchedHook: input.selectedHook,
    }))
    const map = handlers({
      "slideshow-generation.validate-input": first,
      "slideshow-generation.apply-fixed-slide-count": second,
    })
    const registry = createPipelineStageRegistry(map)
    expect(registry.get("slideshow-generation.validate-input")?.handler).toBe(
      first
    )

    const single = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.validate-input",
      stageInput: { automationId: "automation-1" },
      requestId: "request-1",
    })

    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(single.output).toEqual({
      automationId: "automation-1",
      selectedHook: "Why Cancer goes quiet",
    })
  })

  it("returns exact provider requests beside output without forwarding them", async () => {
    const traced = handlers({
      "linkedin-generation.resolve-brief": vi.fn(async (input) => {
        recordProviderRequest({
          provider: "OpenRouter",
          operation: "chat.completions",
          model: "openai/test",
          request: {
            model: "openai/test",
            messages: [{ role: "user", content: "Exact prompt" }],
          },
        })
        return { ...input, brief: { audience: "operators" } }
      }),
    })
    const execution = await executePipelineStage({
      registry: createPipelineStageRegistry(traced),
      ownerId: "owner-1",
      stageId: "linkedin-generation.resolve-brief",
      stageInput: { niche: "SaaS" },
    })

    expect(execution.providerRequests).toEqual([
      expect.objectContaining({
        provider: "OpenRouter",
        model: "openai/test",
        request: expect.objectContaining({
          messages: [{ role: "user", content: "Exact prompt" }],
        }),
      }),
    ])
    expect(execution.output).not.toHaveProperty("providerRequests")
  })

  it("represents intermediate media as typed preview and download artifacts", async () => {
    const registry = createPipelineStageRegistry(
      handlers({
        "slideshow-generation.select-slide-images": vi.fn(async () => ({
          selectedImages: [
            {
              id: "image-1",
              imageUrl: "https://cdn.example/slide.webp",
              width: 1080,
              height: 1920,
            },
          ],
        })),
      })
    )
    const execution = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.select-slide-images",
      stageInput: {},
    })

    expect(execution.output.mediaArtifacts).toEqual([
      expect.objectContaining({
        kind: "image",
        mimeType: "image/webp",
        preview: {
          type: "image",
          url: "https://cdn.example/slide.webp",
        },
        download: {
          url: "https://cdn.example/slide.webp",
          fileName: "slide.webp",
        },
        metadata: { width: 1080, height: 1920 },
      }),
    ])
  })

  it("rejects secrets and media bytes at either side of a handler", async () => {
    const registry = createPipelineStageRegistry(handlers())
    await expect(
      executePipelineStage({
        registry,
        ownerId: "owner-1",
        stageId: "linkedin-generation.validate-input",
        stageInput: { apiKey: "secret" },
      })
    ).rejects.toThrow("secret field")

    const leaking = handlers({
      "linkedin-generation.validate-input": vi.fn(async () => ({
        image: new Uint8Array([1, 2, 3]),
      })),
    })
    await expect(
      executePipelineStage({
        registry: createPipelineStageRegistry(leaking),
        ownerId: "owner-1",
        stageId: "linkedin-generation.validate-input",
        stageInput: {},
      })
    ).rejects.toThrow("media bytes")

    await expect(
      executePipelineStage({
        registry,
        ownerId: "owner-1",
        stageId: "linkedin-generation.validate-input",
        stageInput: { image: "data:image/png;base64,AAAA" },
      })
    ).rejects.toThrow("media data URLs")
  })

  it("prevents an atomic handler from crossing more than its declared external-call boundary", async () => {
    const firstCall = vi.fn(async () => ({ ok: true }))
    const forbiddenSecondCall = vi.fn(async () => ({ ok: true }))
    const violating = vi.fn(
      async (
        input: Record<string, unknown>,
        context: {
          externalCall: <T>(
            operation: string,
            task: () => Promise<T>
          ) => Promise<T>
        }
      ) => {
        await context.externalCall("first", firstCall)
        await context.externalCall("second", forbiddenSecondCall)
        return input
      }
    )
    const registry = createPipelineStageRegistry(
      handlers({
        "slideshow-generation.select-one-slide-image": violating,
      })
    )

    await expect(
      executePipelineStage({
        registry,
        ownerId: "owner-1",
        stageId: "slideshow-generation.select-one-slide-image",
        stageInput: { shortlist: [] },
      })
    ).rejects.toThrow("exceeded maxExternalCalls=1")
    expect(firstCall).toHaveBeenCalledOnce()
    expect(forbiddenSecondCall).not.toHaveBeenCalled()
  })

  it("publishes complete typed stage metadata for all seven live workflows", () => {
    const catalog = pipelineCatalog()
    expect(catalog.map((workflow) => workflow.id)).toEqual([
      "slideshow-generation",
      "ugc-video-generation",
      "react-reveal-generation",
      "greenscreen-meme-generation",
      "template-video-generation",
      "linkedin-generation",
      "x-threads-generation",
    ])
    expect(catalog.map((workflow) => workflow.workflowStages.length)).toEqual([
      11, 10, 5, 5, 9, 8, 13,
    ])
    expect(
      catalog.reduce((total, workflow) => total + workflow.stages.length, 0)
    ).toBe(PIPELINE_STAGE_CATALOG.length)
    expect(
      catalog
        .flatMap((workflow) => workflow.stages)
        .every((stage) =>
          ["deterministic", "provider", "storage"].includes(stage.kind)
        )
    ).toBe(true)
    const allStages = catalog.flatMap((workflow) => workflow.stages)
    expect(
      allStages.every((stage) =>
        stage.granularity === "composite"
          ? stage.maxExternalCalls === 0
          : stage.sideEffect === "none"
            ? stage.maxExternalCalls === 0
            : stage.maxExternalCalls === 1
      )
    ).toBe(true)
    expect(allStages.map((stage) => stage.id)).toEqual(
      expect.arrayContaining([
        "slideshow-generation.list-image-collections-page",
        "slideshow-generation.read-one-source-asset",
        "slideshow-generation.create-one-output-asset",
        "slideshow-generation.create-result-document",
        "slideshow-generation.create-one-result-media",
        "slideshow-generation.create-one-post-intent",
        "ugc-video-generation.elevenlabs-synthesize-speech",
        "ugc-video-generation.persist-voice-audio",
        "ugc-video-generation.persist-voice-timings",
        "ugc-video-generation.rendi-init-upload",
        "ugc-video-generation.rendi-upload-part",
        "ugc-video-generation.rendi-complete-upload",
        "ugc-video-generation.rendi-get-file",
        "ugc-video-generation.rendi-submit-command",
        "ugc-video-generation.rendi-get-command",
        "ugc-video-generation.rendi-download-output",
        "ugc-video-generation.rendi-persist-output",
        "ugc-video-generation.get-saved-run-document",
        "ugc-video-generation.create-saved-run-document",
        "ugc-video-generation.inspect-one-saved-asset",
        "ugc-video-generation.create-one-saved-asset",
        "ugc-video-generation.create-final-output-document",
        "ugc-video-generation.create-one-final-output-media",
        "x-threads-generation.get-automation-document",
        "x-threads-generation.create-automation-document",
        "x-threads-generation.get-run-document",
        "x-threads-generation.create-run-document",
        "x-threads-generation.create-one-run-media",
      ])
    )
    expect(
      catalog
        .flatMap((workflow) => workflow.stages)
        .every(
          (stage) =>
            ["atomic", "composite"].includes(stage.granularity) &&
            ["none", "network", "storage"].includes(stage.sideEffect) &&
            [0, 1].includes(stage.maxExternalCalls)
        )
    ).toBe(true)
    expect(
      allStages.some((stage) =>
        [
          "slideshow-generation.research-hook",
          "slideshow-generation.retry-text-similarity",
          "slideshow-generation.derive-visual-concepts",
          "slideshow-generation.translate-plan",
          "slideshow-generation.render-store-mp4",
          "slideshow-generation.list-usage-history",
          "slideshow-generation.list-prior-runs",
        ].includes(stage.id)
      )
    ).toBe(false)
  })
})
