import "server-only"

import {
  listAutomationRuns,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { getAutomationRecord } from "@/lib/automations"
import { clean, isRecord } from "@/lib/guards"
import {
  listGeneratedVideoExports,
  type GeneratedVideoExport,
} from "@/lib/generated-videos"
import type { ResultRecord } from "@/lib/results"
import type { XAutomationRun, XTrendCandidate } from "@/lib/x-automation"
import { listXAutomationRuns } from "@/lib/x-automation-store"
import {
  queueWindmillWorkflow,
  runWindmillWorkflow,
  type CompletedWindmillWorkflowRun,
  type WindmillWorkflowRun,
} from "@/lib/windmill-workflows"
import { persistQueuedWorkflowRun } from "@/lib/workflow-run-store"

type WorkflowExecutionOptions = {
  ownerId: string
  requestId?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  pollIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}

type SlideshowWorkflowResult = {
  created: AutomationRunRecord[]
  results: ResultRecord[]
  skipped: []
  workflow: CompletedWindmillWorkflowRun
}

export async function runSlideshowTemplateWorkflow(
  input: WorkflowExecutionOptions & {
    templateId: string
    hook?: string
    scheduledFor?: string
    generationSource?: "manual" | "scheduled"
  }
): Promise<SlideshowWorkflowResult> {
  const workflow = await runWindmillWorkflow({
    workflowId: "slideshow-generation",
    ownerId: input.ownerId,
    requestId: input.requestId,
    workflowInput: {
      automationId: input.templateId,
      hook: clean(input.hook) || undefined,
      scheduledFor: clean(input.scheduledFor) || undefined,
      generationSource: input.generationSource ?? "manual",
    },
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    sleep: input.sleep,
  })
  const outputRun = record(workflow.result.run)
  const runs = await listAutomationRuns({
    automationId: input.templateId,
    limit: 100,
  })
  const run =
    runs.find((candidate) => candidate.requestId === workflow.requestId) ??
    runs.find((candidate) => candidate.id === clean(outputRun.id))
  if (!run) {
    throw new Error(
      "Windmill completed slideshow generation without a persisted run"
    )
  }
  const result = isResultRecord(workflow.result.result)
    ? workflow.result.result
    : undefined
  return {
    workflow,
    created: [run],
    results: result ? [result] : [],
    skipped: [],
  }
}

export async function queueSlideshowTemplateWorkflow(
  input: WorkflowExecutionOptions & {
    templateId: string
    hook?: string
    scheduledFor?: string
    generationSource?: "manual" | "scheduled"
  }
) {
  const run = await queueWindmillWorkflow({
    workflowId: "slideshow-generation",
    ownerId: input.ownerId,
    requestId: input.requestId,
    workflowInput: {
      automationId: input.templateId,
      hook: clean(input.hook) || undefined,
      scheduledFor: clean(input.scheduledFor) || undefined,
      generationSource: input.generationSource ?? "manual",
    },
    fetchImpl: input.fetchImpl,
  })
  await persistQueuedWorkflowRun({
    run,
    ownerId: input.ownerId,
    templateId: input.templateId,
  })
  return run
}

export async function runSocialTemplateWorkflow(
  input: WorkflowExecutionOptions & {
    templateId: string
    topic?: string
    sourceCandidate?: XTrendCandidate
  }
) {
  const workflow = await runWindmillWorkflow({
    workflowId: "x-threads-generation",
    ownerId: input.ownerId,
    requestId: input.requestId,
    workflowInput: {
      automationId: input.templateId,
      topic: clean(input.topic) || undefined,
      sourceCandidate: input.sourceCandidate,
    },
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    sleep: input.sleep,
  })
  const outputRun = record(workflow.result.run) as unknown as XAutomationRun
  const runs = await listXAutomationRuns(input.templateId)
  const run =
    runs.find((candidate) => candidate.requestId === workflow.requestId) ??
    runs.find((candidate) => candidate.id === clean(outputRun.id)) ??
    (clean(outputRun.id) ? outputRun : undefined)
  if (!run) {
    throw new Error("Windmill completed social generation without a draft run")
  }
  return { workflow, run }
}

export async function queueSocialTemplateWorkflow(
  input: WorkflowExecutionOptions & {
    templateId: string
    topic?: string
    sourceCandidate?: XTrendCandidate
  }
) {
  const run = await queueWindmillWorkflow({
    workflowId: "x-threads-generation",
    ownerId: input.ownerId,
    requestId: input.requestId,
    workflowInput: {
      automationId: input.templateId,
      topic: clean(input.topic) || undefined,
      sourceCandidate: input.sourceCandidate,
    },
    fetchImpl: input.fetchImpl,
  })
  await persistQueuedWorkflowRun({
    run,
    ownerId: input.ownerId,
    templateId: input.templateId,
  })
  return run
}

export async function runLinkedInWorkflow(
  input: WorkflowExecutionOptions & Record<string, unknown>
) {
  const {
    ownerId,
    requestId,
    fetchImpl,
    timeoutMs,
    pollIntervalMs,
    sleep,
    ...workflowInput
  } = input
  const workflow = await runWindmillWorkflow({
    workflowId: "linkedin-generation",
    ownerId,
    requestId,
    workflowInput,
    fetchImpl,
    timeoutMs,
    pollIntervalMs,
    sleep,
  })
  return { workflow, ...workflow.result }
}

export async function queueLinkedInWorkflow(
  input: WorkflowExecutionOptions & Record<string, unknown>
) {
  const { ownerId, requestId, fetchImpl } = input
  const workflowInput = Object.fromEntries(
    Object.entries(input).filter(
      ([key]) =>
        ![
          "ownerId",
          "requestId",
          "fetchImpl",
          "timeoutMs",
          "pollIntervalMs",
          "sleep",
        ].includes(key)
    )
  )
  const run = await queueWindmillWorkflow({
    workflowId: "linkedin-generation",
    ownerId,
    requestId,
    workflowInput,
    fetchImpl,
  })
  await persistQueuedWorkflowRun({ run, ownerId })
  return run
}

export async function runVideoTemplateWorkflow(
  input: WorkflowExecutionOptions & {
    templateId: string
    generationId?: string
    scheduledFor?: string
  }
): Promise<{
  workflow: CompletedWindmillWorkflowRun
  export: GeneratedVideoExport
}> {
  const template = await getAutomationRecord(input.templateId)
  if (!template) throw new Error("Template not found")
  const format = template.schema.video_format?.template
  const workflowId =
    template.schema.automationKind === "ugc" || format === "ugc_ad"
      ? "ugc-video-generation"
      : format === "react_reveal"
        ? "react-reveal-generation"
        : format === "greenscreen_meme"
          ? "greenscreen-meme-generation"
          : "template-video-generation"
  const workflow = await runWindmillWorkflow({
    workflowId,
    ownerId: input.ownerId,
    requestId: input.requestId,
    workflowInput: {
      templateId: input.templateId,
    },
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    sleep: input.sleep,
  })
  const inlineOutput = record(workflow.result.finalOutput)
  const exports = await listGeneratedVideoExports({
    automationId: input.templateId,
    limit: 100,
  })
  const generated =
    exports.find(
      (candidate) =>
        clean(record(candidate.sourceConfig).requestId) === workflow.requestId
    ) ??
    exports.find((candidate) => candidate.id === clean(inlineOutput.id)) ??
    (clean(inlineOutput.id)
      ? (inlineOutput as unknown as GeneratedVideoExport)
      : undefined)
  if (!generated) {
    throw new Error("Windmill completed video generation without an output")
  }
  return { workflow, export: generated }
}

export async function queueVideoTemplateWorkflow(
  input: WorkflowExecutionOptions & {
    templateId: string
    generationId?: string
    scheduledFor?: string
  }
) {
  const workflowId = await videoWorkflowId(input.templateId)
  const run = await queueWindmillWorkflow({
    workflowId,
    ownerId: input.ownerId,
    requestId: input.requestId,
    workflowInput: { templateId: input.templateId },
    fetchImpl: input.fetchImpl,
  })
  await persistQueuedWorkflowRun({
    run,
    ownerId: input.ownerId,
    templateId: input.templateId,
  })
  return run
}

export async function resolveQueuedWorkflowResponse(input: {
  run: CompletedWindmillWorkflowRun
  templateId?: string
}) {
  const workflow = input.run as CompletedWindmillWorkflowRun
  if (workflow.workflowId === "slideshow-generation") {
    if (!input.templateId)
      throw new Error("Slideshow workflow lost its template id")
    return resolveSlideshowWorkflow(workflow, input.templateId)
  }
  if (workflow.workflowId === "x-threads-generation") {
    if (!input.templateId)
      throw new Error("Social workflow lost its template id")
    return resolveSocialWorkflow(workflow, input.templateId)
  }
  if (workflow.workflowId === "linkedin-generation") {
    return { workflow, ...workflow.result }
  }
  if (!input.templateId) throw new Error("Video workflow lost its template id")
  return resolveVideoWorkflow(workflow, input.templateId)
}

async function videoWorkflowId(templateId: string) {
  const template = await getAutomationRecord(templateId)
  if (!template) throw new Error("Template not found")
  const format = template.schema.video_format?.template
  return template.schema.automationKind === "ugc" || format === "ugc_ad"
    ? ("ugc-video-generation" as const)
    : format === "react_reveal"
      ? ("react-reveal-generation" as const)
      : format === "greenscreen_meme"
        ? ("greenscreen-meme-generation" as const)
        : ("template-video-generation" as const)
}

async function resolveSlideshowWorkflow(
  workflow: CompletedWindmillWorkflowRun,
  templateId: string
) {
  const outputRun = record(workflow.result.run)
  const runs = await listAutomationRuns({
    automationId: templateId,
    limit: 100,
  })
  const run =
    runs.find((candidate) => candidate.requestId === workflow.requestId) ??
    runs.find((candidate) => candidate.id === clean(outputRun.id))
  if (!run)
    throw new Error(
      "Windmill completed slideshow generation without a persisted run"
    )
  const result = isResultRecord(workflow.result.result)
    ? workflow.result.result
    : undefined
  return {
    workflow,
    created: [run],
    results: result ? [result] : [],
    skipped: [],
  }
}

async function resolveSocialWorkflow(
  workflow: CompletedWindmillWorkflowRun,
  templateId: string
) {
  const outputRun = record(workflow.result.run) as unknown as XAutomationRun
  const runs = await listXAutomationRuns(templateId)
  const run =
    runs.find((candidate) => candidate.requestId === workflow.requestId) ??
    runs.find((candidate) => candidate.id === clean(outputRun.id)) ??
    (clean(outputRun.id) ? outputRun : undefined)
  if (!run)
    throw new Error("Windmill completed social generation without a draft run")
  return { workflow, run }
}

async function resolveVideoWorkflow(
  workflow: CompletedWindmillWorkflowRun,
  templateId: string
) {
  const inlineOutput = record(workflow.result.finalOutput)
  const exports = await listGeneratedVideoExports({
    automationId: templateId,
    limit: 100,
  })
  const generated =
    exports.find(
      (candidate) =>
        clean(record(candidate.sourceConfig).requestId) === workflow.requestId
    ) ??
    exports.find((candidate) => candidate.id === clean(inlineOutput.id)) ??
    (clean(inlineOutput.id)
      ? (inlineOutput as unknown as GeneratedVideoExport)
      : undefined)
  if (!generated)
    throw new Error("Windmill completed video generation without an output")
  return { workflow, export: generated }
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isResultRecord(value: unknown): value is ResultRecord {
  return isRecord(value) && Boolean(clean(value.id))
}
