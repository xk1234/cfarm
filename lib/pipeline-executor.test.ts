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

  it("publishes complete typed stage metadata for all four live workflows", () => {
    const catalog = pipelineCatalog()
    expect(catalog.map((workflow) => workflow.id)).toEqual([
      "slideshow-generation",
      "ugc-video-generation",
      "linkedin-generation",
      "x-threads-generation",
    ])
    expect(catalog.map((workflow) => workflow.stages.length)).toEqual([
      16, 9, 8, 12,
    ])
    expect(
      catalog
        .flatMap((workflow) => workflow.stages)
        .every((stage) =>
          ["deterministic", "provider", "storage"].includes(stage.kind)
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
