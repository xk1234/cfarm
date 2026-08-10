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
  fetchImpl?: typeof fetch
}): Promise<WindmillWorkflowRun> {
  const config = windmillConfig()
  const flowPath = WINDMILL_FLOW_PATHS[input.workflowId]
  const requestId = `pipeline-${crypto.randomUUID()}`
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

function windmillFlowInput(
  workflowId: PipelineWorkflowId,
  input: Record<string, unknown>
) {
  const contract = WINDMILL_WORKFLOW_INPUTS[workflowId]
  const aliases = WINDMILL_WORKFLOW_INPUT_ALIASES[workflowId]
  const accepted = new Set<string>([...contract, ...Object.keys(aliases)])
  const unsupported = Object.keys(input).filter((key) => !accepted.has(key))
  if (unsupported.length) {
    throw new Error(
      `${workflowId} does not accept input ${unsupported.sort().join(", ")}. Accepted inputs: ${contract.join(", ")}`
    )
  }

  const normalized: Record<string, unknown> = {}
  for (const key of contract) {
    const alias = Object.entries(aliases).find(
      ([, canonical]) => canonical === key
    )?.[0]
    const value = input[key] ?? (alias ? input[alias] : undefined)
    if (value !== undefined) normalized[key] = value
  }
  return normalized
}

const WINDMILL_WORKFLOW_INPUTS = {
  "slideshow-generation": ["automation_id"],
  "ugc-video-generation": [
    "template_id",
    "product",
    "script",
    "actor",
    "voice",
    "broll",
    "render",
  ],
  "react-reveal-generation": [
    "template_id",
    "anticipation",
    "reveal",
    "hook_caption",
    "payoff_caption",
    "audio",
    "output",
  ],
  "greenscreen-meme-generation": [
    "template_id",
    "meme",
    "background",
    "caption",
    "text_placement",
    "audio",
    "output",
  ],
  "linkedin-generation": [
    "niche",
    "topic",
    "excluded_topics",
    "proof",
    "persona",
    "brief",
    "brief_model",
    "model",
    "count",
  ],
  "x-threads-generation": ["automation_id", "topic", "source_candidate"],
} as const satisfies Record<PipelineWorkflowId, readonly string[]>

const WINDMILL_WORKFLOW_INPUT_ALIASES = {
  "slideshow-generation": { automationId: "automation_id" },
  "ugc-video-generation": { templateId: "template_id" },
  "react-reveal-generation": {
    templateId: "template_id",
    hookCaption: "hook_caption",
    payoffCaption: "payoff_caption",
  },
  "greenscreen-meme-generation": {
    templateId: "template_id",
    textPlacement: "text_placement",
  },
  "linkedin-generation": {
    excludedTopics: "excluded_topics",
    briefModel: "brief_model",
  },
  "x-threads-generation": {
    automationId: "automation_id",
    sourceCandidate: "source_candidate",
  },
} as const satisfies Record<PipelineWorkflowId, Record<string, string>>

export function windmillWorkflowInputNames(workflowId: PipelineWorkflowId) {
  return [...WINDMILL_WORKFLOW_INPUTS[workflowId]]
}

export function isPipelineWorkflowId(
  value: string
): value is PipelineWorkflowId {
  return (PIPELINE_WORKFLOW_IDS as readonly string[]).includes(value)
}
