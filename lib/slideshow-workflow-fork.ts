import "server-only"

import { randomUUID } from "node:crypto"

import { slideshowDeliveryLinks } from "@/lib/asset-urls"
import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { clean } from "@/lib/guards"
import { createProductionPipelineHandlers } from "@/lib/mcp/production-pipeline-handlers"
import {
  createPipelineStageRegistry,
  executeNamedPipeline,
  executePipelineStage,
} from "@/lib/pipeline-executor"
import { getReminderSettings } from "@/lib/reminder-settings"
import { enqueueJob, getJob } from "@/lib/queue"
import {
  applyWorkflowTextPatch,
  workflowTextAtPath,
  WorkflowTextPatchError,
} from "@/lib/workflow-text-patch"

const maximumVariations = 4
const maximumPatchLength = 20_000

export type WorkflowForkVariation = {
  name: string
  replacement: string
}

export type SlideshowWorkflowForkInput = {
  parentRunId: string
  stageId: "generate-text"
  scope: "input" | "selection"
  path: string
  selectionStart?: number
  selectionEnd?: number
  selectedText?: string
  variations: WorkflowForkVariation[]
}

export type SlideshowWorkflowForkResult = {
  groupId: string
  parentRunId: string
  runs: Array<{
    run: AutomationRunRecord
    variationId: string
    variationName: string
    workflowUrl: string
    previewUrl?: string
    downloadUrl?: string
  }>
}

export async function forkSlideshowWorkflow(
  ownerId: string,
  input: SlideshowWorkflowForkInput
): Promise<SlideshowWorkflowForkResult> {
  assertForkInput(input)
  const parent = await findRun(input.parentRunId)
  if (!parent) throw new WorkflowForkError(404, "Workflow run not found")
  if (!parent.plan.debug?.textModelPrompt) {
    throw new WorkflowForkError(
      409,
      "This historical run did not record its provider request and cannot be forked from the prompt."
    )
  }
  const selection = resolveForkSelection(
    parent.plan.debug.textModelPrompt,
    input
  )

  const registry = createPipelineStageRegistry(
    createProductionPipelineHandlers({
      now: () => new Date(),
      getReminderSettings,
      enqueueJob,
      getJob,
      ugcGenerationEnabled: () => process.env.ENABLE_UGC_AUTOMATION === "true",
    })
  )
  const groupId = `workflow-fork-${randomUUID()}`
  const createdAt = new Date().toISOString()
  const baseRequestId = `${groupId}-base`
  const validated = await executePipelineStage({
    registry,
    ownerId,
    stageId: "slideshow-generation.validate-input",
    stageInput: {
      automationId: parent.automationId,
      scheduledFor: parent.scheduledFor,
    },
    requestId: baseRequestId,
  })
  const counted = await executePipelineStage({
    registry,
    ownerId,
    stageId: "slideshow-generation.resolve-slide-count",
    stageInput: validated.output,
    requestId: baseRequestId,
  })
  const baseState = {
    ...counted.output,
    hook: parent.plan.hook,
    hookId: parent.plan.hookId,
    hookTemplate: parent.plan.hookTemplate,
    hookSubstitutions: parent.plan.hookSubstitutions,
    textModel: parent.plan.textModel || counted.output.textModel,
  }

  const completed: SlideshowWorkflowForkResult["runs"] = []
  for (const [index, variation] of input.variations.entries()) {
    const variationId = `${groupId}-v${index + 1}`
    let promptPayload: Record<string, unknown>
    try {
      promptPayload = applyWorkflowTextPatch(
        parent.plan.debug.textModelPrompt,
        {
          path: input.path,
          selectionStart: selection.selectionStart,
          selectionEnd: selection.selectionEnd,
          selectedText: selection.selectedText,
          replacement: variation.replacement,
        }
      )
    } catch (error) {
      if (error instanceof WorkflowTextPatchError) {
        throw new WorkflowForkError(error.status, error.message)
      }
      throw error
    }
    const workflowFork = {
      groupId,
      parentRunId: parent.id,
      forkStageId: input.stageId,
      forkScope: input.scope,
      inputPath: input.path,
      variationId,
      variationName: variation.name,
      selectedText: selection.selectedText,
      replacement: variation.replacement,
      createdAt,
    }
    await executeNamedPipeline({
      registry,
      ownerId,
      workflowId: "slideshow-generation",
      workflowInput: {
        ...structuredClone(baseState),
        runId: variationId,
        requestId: variationId,
        scheduledFor: createdAt,
        promptPayload,
        workflowFork,
      },
      requestId: variationId,
      startAt: "slideshow-generation.generate-slide-text",
    })

    const run = await findRun(variationId, parent.automationId)
    if (!run) {
      throw new Error(`Fork variation ${variation.name} did not persist a run`)
    }
    const delivery = run.slideshowId
      ? slideshowDeliveryLinks({ ownerId, outputId: run.slideshowId })
      : null
    completed.push({
      run,
      variationId,
      variationName: variation.name,
      workflowUrl: `/app/workflows/slideshows/${encodeURIComponent(run.id)}`,
      previewUrl: delivery?.previewUrl,
      downloadUrl: delivery?.downloadUrl,
    })
  }

  return { groupId, parentRunId: parent.id, runs: completed }
}

async function findRun(runId: string, automationId?: string) {
  const runs = await listAutomationRuns({ automationId, limit: 500 })
  return (
    runs.find((run) => run.id === runId || run.slideshowId === runId) ?? null
  )
}

function assertForkInput(input: SlideshowWorkflowForkInput) {
  if (!clean(input.parentRunId)) {
    throw new WorkflowForkError(400, "A parent workflow run is required")
  }
  if (input.stageId !== "generate-text") {
    throw new WorkflowForkError(
      400,
      "Prompt forking currently starts at slideshow text generation"
    )
  }
  if (!input.path.startsWith("/messages/")) {
    throw new WorkflowForkError(
      400,
      "Only persisted prompt messages can be forked"
    )
  }
  if (
    input.variations.length < 1 ||
    input.variations.length > maximumVariations
  ) {
    throw new WorkflowForkError(
      400,
      `Add between 1 and ${maximumVariations} variations`
    )
  }
  for (const variation of input.variations) {
    if (
      !clean(variation.name) ||
      variation.replacement.length > maximumPatchLength
    ) {
      throw new WorkflowForkError(
        400,
        "Every variation needs a name and a valid replacement"
      )
    }
  }
}

function resolveForkSelection(
  prompt: Record<string, unknown>,
  input: SlideshowWorkflowForkInput
) {
  let current: string
  try {
    current = workflowTextAtPath(prompt, input.path)
  } catch (error) {
    if (error instanceof WorkflowTextPatchError) {
      throw new WorkflowForkError(error.status, error.message)
    }
    throw error
  }
  if (input.scope === "input") {
    if (!current || current.length > maximumPatchLength) {
      throw new WorkflowForkError(400, "The prompt input is too large to fork")
    }
    return {
      selectionStart: 0,
      selectionEnd: current.length,
      selectedText: current,
    }
  }
  if (
    !Number.isInteger(input.selectionStart) ||
    !Number.isInteger(input.selectionEnd) ||
    input.selectionStart! < 0 ||
    input.selectionEnd! <= input.selectionStart!
  ) {
    throw new WorkflowForkError(400, "Select a non-empty part of the prompt")
  }
  if (!input.selectedText || input.selectedText.length > maximumPatchLength) {
    throw new WorkflowForkError(400, "The selected prompt passage is too large")
  }
  return {
    selectionStart: input.selectionStart!,
    selectionEnd: input.selectionEnd!,
    selectedText: input.selectedText,
  }
}

export class WorkflowForkError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "WorkflowForkError"
  }
}
