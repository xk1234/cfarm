import { describe, expect, it, vi } from "vitest"

import {
  createPipelineStageRegistry,
  executeNamedPipeline,
  executePipelineStage,
  pipelineCatalog,
  type PipelineHandlerMap,
} from "@/lib/pipeline-executor"
import { PIPELINE_STAGE_CATALOG } from "@/lib/pipeline-stages"

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
  it("pipes complete structured output through the exact registered handlers", async () => {
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
      "slideshow-generation.resolve-slide-count": second,
    })
    const registry = createPipelineStageRegistry(map)
    expect(registry.get("slideshow-generation.validate-input")?.handler).toBe(
      first
    )

    const workflow = await executeNamedPipeline({
      registry,
      ownerId: "owner-1",
      workflowId: "slideshow-generation",
      workflowInput: { automationId: "automation-1" },
      requestId: "request-1",
      stopAfter: "slideshow-generation.resolve-slide-count",
    })
    const single = await executePipelineStage({
      registry,
      ownerId: "owner-1",
      stageId: "slideshow-generation.validate-input",
      stageInput: { automationId: "automation-1" },
      requestId: "request-1",
    })

    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ selectedHook: "Why Cancer goes quiet" }),
      expect.objectContaining({ ownerId: "owner-1" })
    )
    expect(workflow).toMatchObject({
      status: "succeeded",
      completedStages: 2,
      output: {
        selectedHook: "Why Cancer goes quiet",
        researchedHook: "Why Cancer goes quiet",
      },
    })
    expect(single.output).toEqual({
      automationId: "automation-1",
      selectedHook: "Why Cancer goes quiet",
    })
  })

  it("pauses a workflow on a long-running stage operation", async () => {
    const queued = vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      operation: {
        id: "job-1",
        status: "running",
        nextPollAfterMs: 5000,
      },
    }))
    const later = vi.fn()
    const registry = createPipelineStageRegistry(
      handlers({
        "ugc-video-generation.analyze-product": queued,
        "ugc-video-generation.generate-script-plan": later,
      })
    )
    const workflow = await executeNamedPipeline({
      registry,
      ownerId: "owner-1",
      workflowId: "ugc-video-generation",
      workflowInput: { automationId: "ugc-1" },
    })

    expect(workflow).toMatchObject({
      status: "running",
      activeStage: "ugc-video-generation.analyze-product",
      completedStages: 0,
      operation: { id: "job-1" },
    })
    expect(later).not.toHaveBeenCalled()
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

  it("publishes complete typed stage metadata for all four live workflows", () => {
    const catalog = pipelineCatalog()
    expect(catalog.map((workflow) => workflow.id)).toEqual([
      "slideshow-generation",
      "ugc-video-generation",
      "linkedin-generation",
      "x-threads-generation",
    ])
    expect(catalog.map((workflow) => workflow.workflowStages.length)).toEqual([
      16, 9, 8, 12,
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
        "slideshow-generation.rendi-init-upload",
        "slideshow-generation.rendi-upload-part",
        "slideshow-generation.rendi-complete-upload",
        "slideshow-generation.rendi-get-file",
        "slideshow-generation.rendi-submit-command",
        "slideshow-generation.rendi-get-command",
        "slideshow-generation.rendi-download-output",
        "slideshow-generation.rendi-persist-output",
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
      catalog
        .flatMap((workflow) => workflow.stages)
        .find((stage) => stage.id === "slideshow-generation.research-hook")
    ).toMatchObject({
      provider: "OpenRouter + Exa",
      model: "openai/gpt-5.4-mini",
    })
  })
})
