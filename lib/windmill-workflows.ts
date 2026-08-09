import { clean } from "@/lib/guards"
import {
  PIPELINE_WORKFLOW_IDS,
  type PipelineWorkflowId,
} from "@/lib/pipeline-stages"

const WINDMILL_FLOW_PATHS: Record<PipelineWorkflowId, string> = {
  "slideshow-generation": "f/lumenclip/slideshow_generation",
  "ugc-video-generation": "f/lumenclip/ugc_video_generation",
  "react-reveal-generation": "f/lumenclip/react_reveal_generation",
  "greenscreen-meme-generation": "f/lumenclip/greenscreen_meme_generation",
  "linkedin-generation": "f/lumenclip/linkedin_generation",
  "x-threads-generation": "f/lumenclip/x_threads_generation",
}

export type WindmillWorkflowRun = {
  workflowId: PipelineWorkflowId
  requestId: string
  status: "queued"
  jobId: string
  flowPath: string
}

export async function queueWindmillWorkflow(input: {
  workflowId: PipelineWorkflowId
  ownerId: string
  workflowInput: Record<string, unknown>
  requestId?: string
  startAt?: string
  stopAfter?: string
  fetchImpl?: typeof fetch
}): Promise<WindmillWorkflowRun> {
  assertNoLinearExecutionWindow(input.startAt, input.stopAfter)
  const config = windmillConfig()
  const flowPath = WINDMILL_FLOW_PATHS[input.workflowId]
  const requestId = clean(input.requestId) || `pipeline-${crypto.randomUUID()}`
  const response = await (input.fetchImpl ?? fetch)(
    windmillApiUrl(config, `jobs/run/f/${flowPath}`),
    {
      method: "POST",
      headers: windmillHeaders(config.token),
      body: JSON.stringify({
        owner_id: input.ownerId,
        request_id: requestId,
        ...windmillFlowInput(input.workflowId, input.workflowInput),
      }),
    }
  )
  const jobId = clean(await response.text())
  if (!response.ok || !jobId) {
    throw new Error(
      `Windmill rejected ${input.workflowId}: ${response.status} ${jobId || response.statusText}`
    )
  }
  return {
    workflowId: input.workflowId,
    requestId,
    status: "queued",
    jobId,
    flowPath,
  }
}

export function windmillConfigured() {
  return Boolean(
    process.env.WINDMILL_BASE_URL?.trim() &&
    process.env.WINDMILL_WORKSPACE_ID?.trim() &&
    process.env.WINDMILL_TOKEN?.trim()
  )
}

function windmillConfig() {
  const baseUrl = requiredEnv("WINDMILL_BASE_URL").replace(/\/$/, "")
  const parsed = new URL(baseUrl)
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("WINDMILL_BASE_URL must use http or https")
  }
  return {
    baseUrl,
    workspaceId: requiredEnv("WINDMILL_WORKSPACE_ID"),
    token: requiredEnv("WINDMILL_TOKEN"),
  }
}

function windmillApiUrl(
  config: ReturnType<typeof windmillConfig>,
  path: string
) {
  return `${config.baseUrl}/api/w/${encodeURIComponent(config.workspaceId)}/${path}`
}

function windmillHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function assertNoLinearExecutionWindow(startAt?: string, stopAfter?: string) {
  if (startAt || stopAfter) {
    throw new Error(
      "DAG workflow runs do not support linear startAt/stopAfter windows; run the named stage directly"
    )
  }
}

function windmillFlowInput(
  workflowId: PipelineWorkflowId,
  input: Record<string, unknown>
) {
  const normalized = { ...input }
  if (
    workflowId === "slideshow-generation" ||
    workflowId === "x-threads-generation"
  ) {
    normalized.automation_id ??= input.automationId
  }
  if (
    workflowId === "ugc-video-generation" ||
    workflowId === "react-reveal-generation" ||
    workflowId === "greenscreen-meme-generation"
  ) {
    normalized.template_id ??= input.templateId
  }
  if (workflowId === "ugc-video-generation") {
    normalized.generation_id ??= input.generationId
    normalized.scheduled_for ??= input.scheduledFor
  }
  if (workflowId === "react-reveal-generation") {
    normalized.hook_caption ??= input.hookCaption
    normalized.payoff_caption ??= input.payoffCaption
  }
  if (workflowId === "greenscreen-meme-generation") {
    normalized.text_placement ??= input.textPlacement
  }
  if (workflowId === "linkedin-generation") {
    normalized.excluded_topics ??= input.excludedTopics
    normalized.brief_model ??= input.briefModel
  }
  if (workflowId === "x-threads-generation") {
    normalized.source_candidate ??= input.sourceCandidate
  }
  delete normalized.automationId
  delete normalized.templateId
  delete normalized.sourceCandidate
  delete normalized.generationId
  delete normalized.scheduledFor
  delete normalized.hookCaption
  delete normalized.payoffCaption
  delete normalized.textPlacement
  delete normalized.excludedTopics
  delete normalized.briefModel
  return normalized
}

export function isPipelineWorkflowId(
  value: string
): value is PipelineWorkflowId {
  return (PIPELINE_WORKFLOW_IDS as readonly string[]).includes(value)
}
