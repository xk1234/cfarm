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
  "template-video-generation": "f/lumenclip/template_video_generation",
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

export type WindmillWorkflowJob = {
  id: string
  status: "queued" | "running" | "succeeded" | "failed"
  success?: boolean
  result?: unknown
  error?: string
}

export type CompletedWindmillWorkflowRun = Omit<
  WindmillWorkflowRun,
  "status"
> & {
  status: "succeeded"
  result: Record<string, unknown>
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
  const response = await windmillFetch(
    input.fetchImpl ?? fetch,
    windmillApiUrl(config, `jobs/run/f/${flowPath}`),
    {
      method: "POST",
      headers: windmillHeaders(config.token),
      body: JSON.stringify({
        owner_id: input.ownerId,
        request_id: requestId,
        ...windmillFlowInput(input.workflowId, input.workflowInput),
      }),
    },
    Number(process.env.WINDMILL_REQUEST_TIMEOUT_MS ?? 30_000)
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

export async function getWindmillWorkflowJob(input: {
  jobId: string
  fetchImpl?: typeof fetch
}): Promise<WindmillWorkflowJob> {
  const config = windmillConfig()
  const response = await windmillFetch(
    input.fetchImpl ?? fetch,
    windmillApiUrl(
      config,
      `jobs_u/get/${encodeURIComponent(requiredValue("jobId", input.jobId))}?no_logs=true&no_code=true`
    ),
    { headers: windmillHeaders(config.token) },
    Number(process.env.WINDMILL_REQUEST_TIMEOUT_MS ?? 30_000)
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !isRecord(payload)) {
    throw new Error(
      `Windmill job lookup failed: ${response.status} ${response.statusText}`
    )
  }
  const id = clean(payload.id) || input.jobId
  if (payload.type === "CompletedJob" || typeof payload.success === "boolean") {
    const success = payload.success === true
    return {
      id,
      status: success ? "succeeded" : "failed",
      success,
      result: payload.result,
      error: success ? undefined : windmillError(payload.result),
    }
  }
  return {
    id,
    status: payload.running === true ? "running" : "queued",
  }
}

export async function waitForWindmillWorkflow(input: {
  run: WindmillWorkflowRun
  timeoutMs?: number
  pollIntervalMs?: number
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<CompletedWindmillWorkflowRun> {
  const timeoutMs = Math.max(1_000, input.timeoutMs ?? 25 * 60_000)
  const pollIntervalMs = Math.max(250, input.pollIntervalMs ?? 1_000)
  const deadline = Date.now() + timeoutMs
  const sleep = input.sleep ?? delay
  let attempt = 0
  while (Date.now() < deadline) {
    const job = await getWindmillWorkflowJob({
      jobId: input.run.jobId,
      fetchImpl: input.fetchImpl,
    })
    if (job.status === "failed") {
      throw new Error(
        job.error || `Windmill ${input.run.workflowId} workflow failed`
      )
    }
    if (job.status === "succeeded") {
      return {
        ...input.run,
        status: "succeeded",
        result: unwrapWindmillWorkflowResult(job.result),
      }
    }
    const backoff = Math.min(10_000, pollIntervalMs * 1.5 ** attempt)
    const jitter = input.sleep ? 0 : Math.floor(Math.random() * backoff * 0.2)
    await sleep(Math.min(backoff + jitter, Math.max(0, deadline - Date.now())))
    attempt += 1
  }
  throw new Error(
    `Windmill ${input.run.workflowId} workflow timed out after ${timeoutMs}ms`
  )
}

export async function runWindmillWorkflow(
  input: Parameters<typeof queueWindmillWorkflow>[0] & {
    timeoutMs?: number
    pollIntervalMs?: number
    sleep?: (milliseconds: number) => Promise<void>
  }
) {
  const run = await queueWindmillWorkflow(input)
  return waitForWindmillWorkflow({
    run,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  })
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

function requiredValue(name: string, value: unknown) {
  const result = clean(value)
  if (!result) throw new Error(`${name} is required`)
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function windmillError(result: unknown) {
  if (!isRecord(result)) return clean(result) || undefined
  const error = isRecord(result.error) ? result.error : result
  return clean(error.message) || clean(error.name) || "Windmill workflow failed"
}

function unwrapWindmillWorkflowResult(result: unknown) {
  if (result === "WINDMILL_TOO_BIG") {
    throw new Error(
      "Windmill completed the workflow but its result exceeded the inline result limit"
    )
  }
  if (!isRecord(result)) return { value: result }
  return isRecord(result.output) ? result.output : result
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function windmillFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const boundedTimeout = Math.max(1_000, Math.min(timeoutMs, 120_000))
  return fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(boundedTimeout),
  })
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
  const contract = WINDMILL_WORKFLOW_INPUTS[workflowId]
  const aliases = WINDMILL_WORKFLOW_INPUT_ALIASES[workflowId]
  const accepted = new Set<string>([
    ...contract,
    ...Object.keys(aliases),
    ...(workflowId === "slideshow-generation" ? SLIDESHOW_FORM_KEYS : []),
  ])
  const unsupported = Object.keys(input).filter((key) => !accepted.has(key))
  if (unsupported.length) {
    throw new Error(
      `${workflowId} does not accept input ${unsupported.sort().join(", ")}. Accepted inputs: ${contract.join(", ")}`
    )
  }
  if (workflowId === "slideshow-generation") {
    return windmillSlideshowFlowInput(input)
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

function windmillSlideshowFlowInput(input: Record<string, unknown>) {
  const templateInputs = isPlainRecord(input.template_inputs)
    ? { ...input.template_inputs }
    : {}
  const automationId = firstDefined(
    templateInputs.automation_id,
    input.automation_id,
    input.automationId
  )
  const hook = firstDefined(templateInputs.hook, input.hook)
  if (automationId !== undefined) templateInputs.automation_id = automationId
  if (typeof hook === "string") {
    if (hook.trim()) templateInputs.hook = hook
  } else if (hook !== undefined) {
    templateInputs.hook = hook
  }

  return {
    template_inputs: templateInputs,
    content_inputs: isPlainRecord(input.content_inputs)
      ? input.content_inputs
      : {},
    collection_inputs: isPlainRecord(input.collection_inputs)
      ? input.collection_inputs
      : {},
    slide_overrides: Array.isArray(input.slide_overrides)
      ? input.slide_overrides
      : [],
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined)
}

const WINDMILL_WORKFLOW_INPUTS = {
  "slideshow-generation": [
    "automation_id",
    "hook",
    "scheduled_for",
    "generation_source",
  ],
  "ugc-video-generation": [
    "template_id",
    "product",
    "script",
    "actor",
    "actor_collection_id",
    "voice",
    "broll",
    "render",
  ],
  "react-reveal-generation": [
    "template_id",
    "anticipation_collection_id",
    "reveal_collection_id",
    "hook_caption",
    "payoff_caption",
    "output",
  ],
  "greenscreen-meme-generation": [
    "template_id",
    "meme_collection_id",
    "background_collection_id",
    "caption",
    "text_placement",
    "output",
  ],
  "template-video-generation": ["template_id"],
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

const SLIDESHOW_FORM_KEYS = [
  "template_inputs",
  "content_inputs",
  "collection_inputs",
  "slide_overrides",
] as const

const WINDMILL_WORKFLOW_INPUT_ALIASES = {
  "slideshow-generation": {
    automationId: "automation_id",
    scheduledFor: "scheduled_for",
    generationSource: "generation_source",
  },
  "ugc-video-generation": {
    templateId: "template_id",
    actorCollectionId: "actor_collection_id",
  },
  "react-reveal-generation": {
    templateId: "template_id",
    anticipationCollectionId: "anticipation_collection_id",
    revealCollectionId: "reveal_collection_id",
    hookCaption: "hook_caption",
    payoffCaption: "payoff_caption",
  },
  "greenscreen-meme-generation": {
    templateId: "template_id",
    memeCollectionId: "meme_collection_id",
    backgroundCollectionId: "background_collection_id",
    textPlacement: "text_placement",
  },
  "template-video-generation": { templateId: "template_id" },
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
