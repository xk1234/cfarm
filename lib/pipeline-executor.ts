import { z } from "zod"

import {
  PIPELINE_STAGE_CATALOG,
  PIPELINE_WORKFLOW_IDS,
  pipelineStagesForWorkflow,
  type PipelineStageExecution,
  type PipelineStageHandler,
  type PipelineStageRegistry,
  type PipelineWorkflowId,
  type RegisteredPipelineStage,
} from "@/lib/pipeline-stages"

export type PipelineHandlerMap = ReadonlyMap<string, PipelineStageHandler>

export function createPipelineStageRegistry(
  handlers: PipelineHandlerMap
): PipelineStageRegistry {
  const registry = new Map<string, RegisteredPipelineStage>()
  for (const metadata of PIPELINE_STAGE_CATALOG) {
    const handler = handlers.get(metadata.id)
    if (!handler) {
      throw new Error(
        `Pipeline stage handler is not registered: ${metadata.id}`
      )
    }
    registry.set(metadata.id, {
      ...metadata,
      inputSchema: safeJsonObjectSchema,
      handler,
    })
  }
  return registry
}

export async function executePipelineStage(input: {
  registry: PipelineStageRegistry
  ownerId: string
  stageId: string
  stageInput: Record<string, unknown>
  requestId?: string
}): Promise<PipelineStageExecution> {
  const registered = input.registry.get(input.stageId)
  if (!registered) throw new Error(`Unknown pipeline stage: ${input.stageId}`)
  const requestId = cleanRequestId(input.requestId)
  const parsed = registered.inputSchema.parse(input.stageInput)
  assertSafePipelineValue(parsed, "input")
  let externalCalls = 0
  const runStage = (stageId: string, stageInput: Record<string, unknown>) =>
    executePipelineStage({
      registry: input.registry,
      ownerId: input.ownerId,
      stageId,
      stageInput,
      requestId,
    })
  const rawOutput = await registered.handler(parsed, {
    ownerId: input.ownerId,
    workflowId: registered.workflowId,
    stageId: registered.id,
    requestId,
    runStage,
    externalCall: async (operation, task) => {
      if (externalCalls >= registered.maxExternalCalls) {
        throw new Error(
          `Pipeline stage ${registered.id} exceeded maxExternalCalls=${registered.maxExternalCalls} before ${operation}`
        )
      }
      externalCalls += 1
      return task()
    },
  })
  assertSafePipelineValue(rawOutput, "output")
  const output = structuredClone(rawOutput)
  const operation = runningOperation(output)
  return {
    stage: stageMetadata(registered),
    requestId,
    status: operation ? "running" : "succeeded",
    externalCalls,
    output,
    ...(operation ? { operation } : {}),
  }
}

export async function executeNamedPipeline(input: {
  registry: PipelineStageRegistry
  ownerId: string
  workflowId: PipelineWorkflowId
  workflowInput: Record<string, unknown>
  requestId?: string
  startAt?: string
  stopAfter?: string
}) {
  if (
    !(PIPELINE_WORKFLOW_IDS as readonly string[]).includes(input.workflowId)
  ) {
    throw new Error(`Unknown pipeline workflow: ${input.workflowId}`)
  }
  const allStages = pipelineStagesForWorkflow(input.workflowId)
  const startIndex = input.startAt
    ? allStages.findIndex((stage) => stage.id === input.startAt)
    : 0
  if (startIndex < 0) {
    throw new Error(
      `Stage ${input.startAt} does not belong to ${input.workflowId}`
    )
  }
  const stopIndex = input.stopAfter
    ? allStages.findIndex((stage) => stage.id === input.stopAfter)
    : allStages.length - 1
  if (stopIndex < startIndex) {
    throw new Error(
      "stopAfter must be the start stage or a later workflow stage"
    )
  }

  const requestId = cleanRequestId(input.requestId)
  let current = structuredClone(input.workflowInput)
  const stages: PipelineStageExecution[] = []
  for (const metadata of allStages.slice(startIndex, stopIndex + 1)) {
    const execution = await executePipelineStage({
      registry: input.registry,
      ownerId: input.ownerId,
      stageId: metadata.id,
      stageInput: current,
      requestId,
    })
    stages.push(execution)
    current = execution.output
    if (execution.status === "running") {
      return {
        workflowId: input.workflowId,
        requestId,
        status: "running" as const,
        completedStages: stages.length - 1,
        totalStages: stopIndex - startIndex + 1,
        activeStage: metadata.id,
        nextStage: allStages[metadata.order]?.id,
        operation: execution.operation,
        output: current,
        stages,
      }
    }
  }
  return {
    workflowId: input.workflowId,
    requestId,
    status: "succeeded" as const,
    completedStages: stages.length,
    totalStages: stopIndex - startIndex + 1,
    output: current,
    stages,
  }
}

export function pipelineCatalog() {
  return PIPELINE_WORKFLOW_IDS.map((workflowId) => ({
    id: workflowId,
    workflowStages: pipelineStagesForWorkflow(workflowId),
    stages: PIPELINE_STAGE_CATALOG.filter(
      (stage) => stage.workflowId === workflowId
    ).sort((left, right) => left.order - right.order),
  }))
}

export function mergePipelineOutput(
  input: Record<string, unknown>,
  additions: Record<string, unknown>
) {
  return { ...input, ...additions }
}

const safeJsonObjectSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    try {
      assertSafePipelineValue(value, "input")
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

function assertSafePipelineValue(value: unknown, path: string): void {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    throw new Error(`Pipeline ${path} cannot contain media bytes`)
  }
  if (typeof value === "string") {
    if (/^data:(?:image|video|audio)\//i.test(value)) {
      throw new Error(`Pipeline ${path} cannot contain media data URLs`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafePipelineValue(item, `${path}.${index}`)
    )
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:api[-_]?key|authorization|secret|token|password)$/i.test(key)) {
      throw new Error(`Pipeline ${path} cannot contain secret field ${key}`)
    }
    assertSafePipelineValue(item, `${path}.${key}`)
  }
}

function runningOperation(output: Record<string, unknown>) {
  const operation = output.operation
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    return undefined
  }
  const status = (operation as Record<string, unknown>).status
  return status === "queued" || status === "running"
    ? (operation as Record<string, unknown>)
    : undefined
}

function stageMetadata(stage: RegisteredPipelineStage) {
  return {
    id: stage.id,
    workflowId: stage.workflowId,
    order: stage.order,
    title: stage.title,
    kind: stage.kind,
    provider: stage.provider,
    model: stage.model,
    optional: stage.optional,
    granularity: stage.granularity,
    sideEffect: stage.sideEffect,
    operation: stage.operation,
    maxExternalCalls: stage.maxExternalCalls,
    workflowStep: stage.workflowStep,
    description: stage.description,
  }
}

function cleanRequestId(value: string | undefined) {
  const requestId = value?.trim()
  return requestId || `pipeline-${crypto.randomUUID()}`
}
