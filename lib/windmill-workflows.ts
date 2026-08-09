import { clean } from "@/lib/guards"
import {
  PIPELINE_WORKFLOW_IDS,
  pipelineStagesForWorkflow,
  type PipelineWorkflowId,
} from "@/lib/pipeline-stages"

const WINDMILL_FLOW_PATHS: Record<PipelineWorkflowId, string> = {
  "slideshow-generation": "f/lumenclip/slideshow_generation",
  "ugc-video-generation": "f/lumenclip/ugc_video_generation",
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
  assertExecutionWindow(input.workflowId, input.startAt, input.stopAfter)
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
        input: input.workflowInput,
        ...(input.startAt ? { start_at: input.startAt } : {}),
        ...(input.stopAfter ? { stop_after: input.stopAfter } : {}),
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

function assertExecutionWindow(
  workflowId: PipelineWorkflowId,
  startAt?: string,
  stopAfter?: string
) {
  const stages = pipelineStagesForWorkflow(workflowId)
  const startIndex = startAt
    ? stages.findIndex((stage) => stage.id === startAt)
    : 0
  const stopIndex = stopAfter
    ? stages.findIndex((stage) => stage.id === stopAfter)
    : stages.length - 1
  if (startIndex < 0) {
    throw new Error(`Stage ${startAt} does not belong to ${workflowId}`)
  }
  if (stopIndex < startIndex) {
    throw new Error(
      "stopAfter must be the start stage or a later workflow stage"
    )
  }
}

export function isPipelineWorkflowId(
  value: string
): value is PipelineWorkflowId {
  return (PIPELINE_WORKFLOW_IDS as readonly string[]).includes(value)
}
