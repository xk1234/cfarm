import { z } from "zod"

export type PipelineStageKind = "deterministic" | "provider" | "storage"
export type PipelineStageGranularity = "atomic" | "composite"
export type PipelineStageSideEffect = "none" | "network" | "storage"

export type PipelineStageMetadata = {
  id: string
  workflowId: PipelineWorkflowId
  order: number
  title: string
  kind: PipelineStageKind
  provider?: string
  model?: string
  optional?: boolean
  granularity: PipelineStageGranularity
  sideEffect: PipelineStageSideEffect
  operation: string
  maxExternalCalls: 0 | 1
  workflowStep: boolean
  description: string
}

export type PipelineStageContext = {
  ownerId: string
  workflowId: PipelineWorkflowId
  stageId: string
  requestId: string
  runStage: (
    stageId: string,
    input: Record<string, unknown>
  ) => Promise<PipelineStageExecution>
  externalCall: <T>(operation: string, task: () => Promise<T>) => Promise<T>
}

export type PipelineStageHandler = (
  input: Record<string, unknown>,
  context: PipelineStageContext
) => Promise<Record<string, unknown>>

export type RegisteredPipelineStage = PipelineStageMetadata & {
  inputSchema: z.ZodType<Record<string, unknown>>
  handler: PipelineStageHandler
}

export type PipelineStageRegistry = ReadonlyMap<string, RegisteredPipelineStage>

export type PipelineStageExecution = {
  stage: PipelineStageMetadata
  requestId: string
  status: "succeeded" | "running"
  output: Record<string, unknown>
  operation?: Record<string, unknown>
  externalCalls: number
}

export const PIPELINE_WORKFLOW_IDS = [
  "slideshow-generation",
  "ugc-video-generation",
  "linkedin-generation",
  "x-threads-generation",
] as const

export type PipelineWorkflowId = (typeof PIPELINE_WORKFLOW_IDS)[number]

const compositeStage = {
  granularity: "composite",
  sideEffect: "none",
  operation: "orchestrate",
  maxExternalCalls: 0,
} as const

export const PIPELINE_STAGE_CATALOG = [
  stage(
    "slideshow-generation",
    1,
    "validate-input",
    "Validate generation input",
    "storage",
    "Load and normalize owner-scoped generation inputs, then reject incomplete configurations.",
    compositeStage
  ),
  stage(
    "slideshow-generation",
    2,
    "resolve-slide-count",
    "Resolve slide count",
    "deterministic",
    "Resolve hook, body, CTA, and total slide counts."
  ),
  stage(
    "slideshow-generation",
    3,
    "select-expand-hook",
    "Select and expand hook",
    "deterministic",
    "Select an unused hook and expand its word-collection substitutions."
  ),
  stage(
    "slideshow-generation",
    4,
    "research-hook",
    "Research selected hook",
    "provider",
    "Research the exact selected hook with source URLs.",
    {
      ...compositeStage,
      provider: "OpenRouter + Exa",
      model: "openai/gpt-5.4-mini",
      optional: true,
    }
  ),
  stage(
    "slideshow-generation",
    5,
    "build-text-prompt",
    "Build structured generation prompt",
    "deterministic",
    "Build the OpenRouter messages and strict slideshow response schema."
  ),
  stage(
    "slideshow-generation",
    6,
    "generate-slide-text",
    "Generate slideshow text",
    "provider",
    "Generate and normalize metadata and non-hook slide text.",
    {
      ...compositeStage,
      provider: "OpenRouter",
      model: "configured slideshowTextModel",
    }
  ),
  stage(
    "slideshow-generation",
    7,
    "retry-text-similarity",
    "Retry similar text",
    "provider",
    "Compare with reuse memory and perform the single authoritative rewrite when needed.",
    {
      ...compositeStage,
      provider: "OpenRouter",
      model: "configured slideshowTextModel",
      optional: true,
    }
  ),
  stage(
    "slideshow-generation",
    8,
    "derive-visual-concepts",
    "Derive visual concepts",
    "provider",
    "Derive concrete visual search concepts for AI-selected slides.",
    {
      provider: "OpenRouter",
      model: "configured slideshowTextModel",
      optional: true,
    }
  ),
  stage(
    "slideshow-generation",
    9,
    "build-image-shortlists",
    "Build image shortlists",
    "deterministic",
    "Rank collection candidates locally and retain bounded per-slide shortlists."
  ),
  stage(
    "slideshow-generation",
    10,
    "select-slide-images",
    "Select slide images",
    "provider",
    "Resolve pinned, deterministic, or model-selected images without returning media bytes.",
    {
      ...compositeStage,
      provider: "OpenRouter when AI selection is enabled",
      model: "configured slideshowTextModel",
    }
  ),
  stage(
    "slideshow-generation",
    11,
    "assemble-plan",
    "Assemble slideshow plan",
    "deterministic",
    "Attach generated text, selected images, roles, and layout into one render plan."
  ),
  stage(
    "slideshow-generation",
    12,
    "translate-plan",
    "Translate displayed text",
    "provider",
    "Translate displayed text for supported non-English targets.",
    { provider: "DeepL", optional: true }
  ),
  stage(
    "slideshow-generation",
    13,
    "render-store-pngs",
    "Render and store PNG slides",
    "storage",
    "Render SVG slides to PNG and persist durable artifact references.",
    compositeStage
  ),
  stage(
    "slideshow-generation",
    14,
    "render-store-mp4",
    "Render and store MP4",
    "provider",
    "Render and persist an H.264 slideshow video when requested.",
    {
      ...compositeStage,
      provider: "Rendi",
      model: "FFmpeg",
      optional: true,
    }
  ),
  stage(
    "slideshow-generation",
    15,
    "validate-output",
    "Validate generated output",
    "deterministic",
    "Run deterministic count, token, word-range, and reuse QA."
  ),
  stage(
    "slideshow-generation",
    16,
    "finalize-output",
    "Finalize generated output",
    "storage",
    "Finalize result/run state and append reuse-memory records.",
    compositeStage
  ),

  atomicStage(
    "slideshow-generation",
    101,
    "load-automation-record",
    "storage",
    "Appwrite automation read",
    "Read one owner-scoped automation record."
  ),
  atomicStage(
    "slideshow-generation",
    102,
    "list-image-collections",
    "storage",
    "Appwrite image-collection list",
    "List owner-scoped image collections once."
  ),
  atomicStage(
    "slideshow-generation",
    103,
    "list-word-collections",
    "storage",
    "Appwrite word-collection list",
    "List owner-scoped word collections once."
  ),
  atomicStage(
    "slideshow-generation",
    104,
    "list-usage-history",
    "storage",
    "Appwrite usage-history list",
    "List owner-scoped usage history once."
  ),
  atomicStage(
    "slideshow-generation",
    105,
    "list-prior-runs",
    "storage",
    "Appwrite automation-run list",
    "List prior owner-scoped automation runs once."
  ),
  atomicStage(
    "slideshow-generation",
    106,
    "load-model-settings",
    "storage",
    "generation-model settings read",
    "Read generation model settings once."
  ),
  atomicStage(
    "slideshow-generation",
    107,
    "research-hook-attempt",
    "provider",
    "OpenRouter chat completion with Exa",
    "Perform exactly one exact-hook research attempt.",
    { provider: "OpenRouter + Exa", model: "openai/gpt-5.4-mini" }
  ),
  atomicStage(
    "slideshow-generation",
    108,
    "generate-slide-text-attempt",
    "provider",
    "OpenRouter chat completion",
    "Perform exactly one structured slideshow-text attempt for a fixed hook.",
    { provider: "OpenRouter", model: "configured slideshowTextModel" }
  ),
  atomicStage(
    "slideshow-generation",
    109,
    "select-one-slide-image",
    "provider",
    "conditional OpenRouter image choice",
    "Select one image for one slide from one supplied shortlist.",
    { provider: "OpenRouter when AI selection is required" }
  ),
  stage(
    "slideshow-generation",
    110,
    "append-usage-records",
    "Append usage records",
    "storage",
    "Append supplied usage records by invoking the singular registered storage stage once per record.",
    { ...compositeStage, workflowStep: false }
  ),
  atomicStage(
    "slideshow-generation",
    111,
    "upsert-automation-run",
    "storage",
    "Appwrite automation-run upsert",
    "Upsert one owner-scoped automation run."
  ),
  atomicStage(
    "slideshow-generation",
    112,
    "append-one-usage-record",
    "storage",
    "Appwrite usage-record create",
    "Append one usage record through one storage action."
  ),

  stage(
    "ugc-video-generation",
    1,
    "analyze-product",
    "Analyze product",
    "provider",
    "Fetch the guarded public product page and extract grounded product facts.",
    {
      ...compositeStage,
      provider: "public HTTP + OpenRouter",
      model: "openai/gpt-5.4-mini",
    }
  ),
  stage(
    "ugc-video-generation",
    2,
    "generate-script-plan",
    "Generate script plan",
    "provider",
    "Generate and validate hook, spoken phases, timing, and b-roll prompts.",
    {
      ...compositeStage,
      provider: "OpenRouter",
      model: "anthropic/claude-sonnet-5",
    }
  ),
  stage(
    "ugc-video-generation",
    3,
    "resolve-generate-actor",
    "Resolve or generate actor",
    "provider",
    "Resolve a configured actor or generate and persist a portrait.",
    {
      ...compositeStage,
      provider: "fal.ai or configured asset",
      model: "fal-ai/flux-2-pro",
    }
  ),
  stage(
    "ugc-video-generation",
    4,
    "synthesize-voice",
    "Synthesize voice",
    "provider",
    "Synthesize speech with word timestamps and persist durable audio references.",
    {
      ...compositeStage,
      provider: "ElevenLabs",
      model: "configured voice model",
    }
  ),
  stage(
    "ugc-video-generation",
    5,
    "animate-actor",
    "Animate actor",
    "provider",
    "Animate the durable actor image and persist the source performance.",
    {
      ...compositeStage,
      provider: "fal.ai",
      model: "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video",
    }
  ),
  stage(
    "ugc-video-generation",
    6,
    "lip-sync-performance",
    "Lip-sync performance",
    "provider",
    "Synchronize the actor performance to the synthesized voice track.",
    {
      ...compositeStage,
      provider: "fal.ai",
      model: "veed/lipsync or fal-ai/kling-video/ai-avatar/v2/standard",
    }
  ),
  stage(
    "ugc-video-generation",
    7,
    "generate-broll",
    "Generate b-roll",
    "provider",
    "Generate, persist, and time supporting visual inserts.",
    {
      ...compositeStage,
      provider: "fal.ai",
      model: "fal-ai/flux-2-pro",
    }
  ),
  stage(
    "ugc-video-generation",
    8,
    "composite-output",
    "Composite output",
    "provider",
    "Build captions and overlays, render the final MP4, and persist its thumbnail.",
    { ...compositeStage, provider: "Rendi", model: "FFmpeg" }
  ),
  stage(
    "ugc-video-generation",
    9,
    "store-final-output",
    "Store final output",
    "storage",
    "Upsert the canonical output and output-media rows with provider provenance.",
    compositeStage
  ),

  stage(
    "ugc-video-generation",
    101,
    "fetch-product-page",
    "Fetch product page",
    "provider",
    "Resolve and fetch a guarded product page through registered one-call DNS and HTTP stages.",
    { ...compositeStage, provider: "public DNS + HTTP", workflowStep: false }
  ),
  atomicStage(
    "ugc-video-generation",
    102,
    "analyze-product-facts",
    "provider",
    "OpenRouter chat completion",
    "Analyze supplied product-page facts or a manual brief in one model call.",
    { provider: "OpenRouter", model: "openai/gpt-5.4-mini" }
  ),
  atomicStage(
    "ugc-video-generation",
    103,
    "generate-script-attempt",
    "provider",
    "OpenRouter chat completion",
    "Generate and validate one UGC script-plan attempt.",
    { provider: "OpenRouter", model: "anthropic/claude-sonnet-5" }
  ),
  atomicStage(
    "ugc-video-generation",
    104,
    "enqueue-checkpoint-job",
    "storage",
    "Appwrite job enqueue",
    "Enqueue one production UGC checkpoint job."
  ),
  atomicStage(
    "ugc-video-generation",
    105,
    "get-checkpoint-job",
    "storage",
    "Appwrite job read",
    "Read one queued UGC checkpoint job."
  ),
  atomicStage(
    "ugc-video-generation",
    106,
    "fal-create-task",
    "provider",
    "fal queue task submit",
    "Submit one fal.ai task and return its request ID.",
    { provider: "fal.ai" }
  ),
  atomicStage(
    "ugc-video-generation",
    107,
    "fal-get-task-status",
    "provider",
    "fal queue status read",
    "Read one fal.ai task status exactly once.",
    { provider: "fal.ai" }
  ),
  atomicStage(
    "ugc-video-generation",
    108,
    "fal-get-task-result",
    "provider",
    "fal queue result read",
    "Read one completed fal.ai task result exactly once.",
    { provider: "fal.ai" }
  ),
  stage(
    "ugc-video-generation",
    109,
    "generate-one-broll-image",
    "Generate one b-roll image",
    "provider",
    "Drive one b-roll item through registered fal submit/status/result stages.",
    { ...compositeStage, provider: "fal.ai", workflowStep: false }
  ),
  atomicStage(
    "ugc-video-generation",
    110,
    "resolve-product-host",
    "provider",
    "public DNS lookup",
    "Resolve and reject private product hosts with one DNS lookup.",
    { provider: "DNS" }
  ),
  atomicStage(
    "ugc-video-generation",
    111,
    "fetch-product-page-response",
    "provider",
    "product-page HTTP request",
    "Fetch and parse exactly one product-page HTTP response.",
    { provider: "public HTTP" }
  ),
  atomicStage(
    "ugc-video-generation",
    112,
    "download-one-broll-asset",
    "provider",
    "remote image HTTP download",
    "Download one completed b-roll image to local temporary staging.",
    { provider: "remote asset host" }
  ),
  atomicStage(
    "ugc-video-generation",
    113,
    "persist-one-broll-asset",
    "storage",
    "Appwrite asset-file create",
    "Persist one locally staged b-roll image and return its durable URL."
  ),
  stage(
    "ugc-video-generation",
    114,
    "discard-broll-temp-file",
    "Discard b-roll temp file",
    "deterministic",
    "Remove one local temporary b-roll image after durable persistence.",
    { workflowStep: false }
  ),

  stage(
    "linkedin-generation",
    1,
    "validate-input",
    "Validate and normalize input",
    "deterministic",
    "Normalize the supported stateless LinkedIn request."
  ),
  stage(
    "linkedin-generation",
    2,
    "resolve-brief",
    "Resolve niche brief",
    "provider",
    "Reuse a valid supplied brief or derive one from the niche.",
    { provider: "OpenRouter when missing", model: "requested briefModel" }
  ),
  stage(
    "linkedin-generation",
    3,
    "select-post-plan",
    "Select post plan",
    "deterministic",
    "Select an archetype, hook style, pillar, topic, and proof."
  ),
  stage(
    "linkedin-generation",
    4,
    "build-generation-request",
    "Build prompt and schema",
    "deterministic",
    "Build the production LinkedIn messages and structured response schema."
  ),
  stage(
    "linkedin-generation",
    5,
    "generate-compose",
    "Generate and compose",
    "provider",
    "Generate structured slots and compose the plain-text post.",
    {
      ...compositeStage,
      provider: "OpenRouter",
      model: "requested post model",
    }
  ),
  stage(
    "linkedin-generation",
    6,
    "validate-draft",
    "Deterministic validation",
    "deterministic",
    "Validate slot lengths, claims, formatting, and platform limits."
  ),
  stage(
    "linkedin-generation",
    7,
    "repair-draft",
    "Repair violations",
    "provider",
    "Repair invalid drafts up to the production attempt limit.",
    {
      ...compositeStage,
      provider: "OpenRouter when repair is needed",
      model: "requested post model",
      optional: true,
    }
  ),
  stage(
    "linkedin-generation",
    8,
    "complete-batch",
    "Complete batch",
    "deterministic",
    "Repeat the registered planning through repair stages until the requested batch is complete.",
    compositeStage
  ),
  atomicStage(
    "linkedin-generation",
    101,
    "generate-slots-attempt",
    "provider",
    "OpenRouter chat completion",
    "Generate one structured LinkedIn slot payload in one provider attempt.",
    { provider: "OpenRouter", model: "requested post model" }
  ),
  stage(
    "linkedin-generation",
    102,
    "compose-draft",
    "Compose LinkedIn draft",
    "deterministic",
    "Compose one plain-text post from supplied structured slots.",
    { workflowStep: false }
  ),

  stage(
    "x-threads-generation",
    1,
    "validate-input",
    "Validate and normalize input",
    "storage",
    "Load and normalize the owner-scoped persisted X/Threads automation generation input."
  ),
  stage(
    "x-threads-generation",
    2,
    "resolve-brief",
    "Resolve required niche brief",
    "provider",
    "Use the persisted brief or return the required strategy preflight.",
    {
      ...compositeStage,
      provider: "OpenRouter preflight",
      model: "configured model with fallback",
    }
  ),
  stage(
    "x-threads-generation",
    3,
    "select-content-plan",
    "Select content plan",
    "deterministic",
    "Select an eligible archetype, pillar, hook style, topic, and proof."
  ),
  stage(
    "x-threads-generation",
    4,
    "build-generation-request",
    "Build generation request",
    "deterministic",
    "Compile production prompts and structured output schema."
  ),
  stage(
    "x-threads-generation",
    5,
    "generate-draft",
    "Generate draft",
    "provider",
    "Fill the selected schema and compose X or Threads posts.",
    {
      ...compositeStage,
      provider: "OpenRouter",
      model: "automation generation model",
    }
  ),
  stage(
    "x-threads-generation",
    6,
    "humanize-draft",
    "Humanize draft",
    "provider",
    "Optionally rewrite in the supplied brand voice without changing facts.",
    {
      provider: "OpenRouter",
      model: "google/gemini-3.1-flash-lite",
      optional: true,
    }
  ),
  stage(
    "x-threads-generation",
    7,
    "review-draft",
    "Review draft",
    "provider",
    "Optionally review factual and brand constraints and apply fixes.",
    { provider: "OpenRouter", model: "openai/gpt-5.4-mini", optional: true }
  ),
  stage(
    "x-threads-generation",
    8,
    "validate-draft",
    "Deterministic validation",
    "deterministic",
    "Validate platform, proof, formatting, and repetition constraints."
  ),
  stage(
    "x-threads-generation",
    9,
    "repair-draft",
    "Repair retry",
    "provider",
    "Regenerate once with exact validation failures.",
    {
      ...compositeStage,
      provider: "OpenRouter when repair is needed",
      model: "automation generation model",
      optional: true,
    }
  ),
  stage(
    "x-threads-generation",
    10,
    "benchmark-build-run",
    "Benchmark and build run",
    "deterministic",
    "Score accepted content and construct the draft run and image prompt."
  ),
  stage(
    "x-threads-generation",
    11,
    "persist-run-memory",
    "Persist run and usage memory",
    "storage",
    "Persist the owner-scoped draft, reminder, and bounded reuse memory.",
    compositeStage
  ),
  stage(
    "x-threads-generation",
    12,
    "generate-image",
    "Generate image",
    "provider",
    "Generate, download, persist, and attach an optional draft image.",
    {
      ...compositeStage,
      provider: "KIE.ai",
      model: "nano-banana-pro",
      optional: true,
    }
  ),
  atomicStage(
    "x-threads-generation",
    101,
    "resolve-brief-attempt",
    "provider",
    "OpenRouter chat completion",
    "Perform one niche-brief derivation attempt with one requested model.",
    { provider: "OpenRouter", model: "requested model" }
  ),
  atomicStage(
    "x-threads-generation",
    102,
    "persist-run",
    "storage",
    "Appwrite X-run upsert",
    "Persist one owner-scoped X/Threads run."
  ),
  stage(
    "x-threads-generation",
    103,
    "enqueue-generated-reminder",
    "Enqueue generated reminder",
    "storage",
    "Read reminder delivery policy and conditionally invoke the registered job-enqueue stage.",
    { ...compositeStage, workflowStep: false }
  ),
  atomicStage(
    "x-threads-generation",
    104,
    "persist-usage-memory",
    "storage",
    "Appwrite X-automation upsert",
    "Persist one bounded usage-memory update."
  ),
  stage(
    "x-threads-generation",
    105,
    "build-image-task",
    "Build image task",
    "deterministic",
    "Build the KIE request payload without a provider call.",
    { workflowStep: false }
  ),
  atomicStage(
    "x-threads-generation",
    106,
    "create-image-task",
    "provider",
    "KIE createTask",
    "Create one KIE image task and return its task ID.",
    { provider: "KIE.ai", model: "nano-banana-pro" }
  ),
  atomicStage(
    "x-threads-generation",
    107,
    "get-image-task",
    "provider",
    "KIE recordInfo",
    "Read one KIE image task status exactly once.",
    { provider: "KIE.ai", model: "nano-banana-pro" }
  ),
  atomicStage(
    "x-threads-generation",
    108,
    "download-image-asset",
    "provider",
    "remote image HTTP download",
    "Download one completed remote image to local temporary staging.",
    { provider: "remote asset host" }
  ),
  atomicStage(
    "x-threads-generation",
    109,
    "persist-image-run",
    "storage",
    "Appwrite X-run upsert",
    "Persist one generated image reference on its owner-scoped run."
  ),
  atomicStage(
    "x-threads-generation",
    110,
    "get-generated-reminder-policy",
    "storage",
    "Appwrite reminder-settings read",
    "Read only the non-secret delivery channel for generated reminders."
  ),
  atomicStage(
    "x-threads-generation",
    111,
    "enqueue-reminder-job",
    "storage",
    "Appwrite reminder-job enqueue",
    "Enqueue one generated-content reminder job."
  ),
  atomicStage(
    "x-threads-generation",
    112,
    "generate-structured-attempt",
    "provider",
    "OpenRouter chat completion",
    "Generate one structured X/Threads slot payload in one provider attempt.",
    { provider: "OpenRouter", model: "automation generation model" }
  ),
  stage(
    "x-threads-generation",
    113,
    "compose-structured-draft",
    "Compose structured draft",
    "deterministic",
    "Normalize supplied structured slots when requested and compose platform posts.",
    { workflowStep: false }
  ),
  atomicStage(
    "x-threads-generation",
    114,
    "persist-image-asset",
    "storage",
    "Appwrite asset-file create",
    "Persist one locally staged image and return its durable URL."
  ),
  stage(
    "x-threads-generation",
    115,
    "discard-image-temp-file",
    "Discard image temp file",
    "deterministic",
    "Remove one local temporary image after durable persistence.",
    { workflowStep: false }
  ),
] as const satisfies readonly PipelineStageMetadata[]

export function pipelineStagesForWorkflow(workflowId: PipelineWorkflowId) {
  return PIPELINE_STAGE_CATALOG.filter(
    (candidate) =>
      candidate.workflowId === workflowId && candidate.workflowStep !== false
  ).sort((left, right) => left.order - right.order)
}

export function pipelineStageId(workflowId: PipelineWorkflowId, name: string) {
  return `${workflowId}.${name}`
}

function atomicStage(
  workflowId: PipelineWorkflowId,
  order: number,
  name: string,
  kind: Exclude<PipelineStageKind, "deterministic">,
  operation: string,
  description: string,
  detail: Partial<
    Pick<PipelineStageMetadata, "provider" | "model" | "optional">
  > = {}
) {
  return stage(
    workflowId,
    order,
    name,
    name
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    kind,
    description,
    {
      ...detail,
      operation,
      workflowStep: false,
      granularity: "atomic",
      sideEffect: kind === "provider" ? "network" : "storage",
      maxExternalCalls: 1,
    }
  )
}

function stage(
  workflowId: PipelineWorkflowId,
  order: number,
  name: string,
  title: string,
  kind: PipelineStageKind,
  description: string,
  detail: Partial<
    Pick<
      PipelineStageMetadata,
      | "provider"
      | "model"
      | "optional"
      | "granularity"
      | "sideEffect"
      | "operation"
      | "maxExternalCalls"
      | "workflowStep"
    >
  > = {}
): PipelineStageMetadata {
  const granularity = detail.granularity ?? "atomic"
  const sideEffect =
    detail.sideEffect ??
    (kind === "provider" ? "network" : kind === "storage" ? "storage" : "none")
  const maxExternalCalls =
    detail.maxExternalCalls ??
    (granularity === "composite" || sideEffect === "none" ? 0 : 1)
  return {
    id: pipelineStageId(workflowId, name),
    workflowId,
    order,
    title,
    kind,
    description,
    granularity,
    sideEffect,
    operation:
      detail.operation ??
      (granularity === "composite"
        ? "orchestrate"
        : sideEffect === "none"
          ? "transform"
          : sideEffect),
    maxExternalCalls,
    workflowStep: detail.workflowStep ?? true,
    ...detail,
  }
}
