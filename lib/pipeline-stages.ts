import { z } from "zod"

export type PipelineStageKind = "deterministic" | "provider" | "storage"

export type PipelineStageMetadata = {
  id: string
  workflowId: PipelineWorkflowId
  order: number
  title: string
  kind: PipelineStageKind
  provider?: string
  model?: string
  optional?: boolean
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
}

export const PIPELINE_WORKFLOW_IDS = [
  "slideshow-generation",
  "ugc-video-generation",
  "linkedin-generation",
  "x-threads-generation",
] as const

export type PipelineWorkflowId = (typeof PIPELINE_WORKFLOW_IDS)[number]

export const PIPELINE_STAGE_CATALOG = [
  stage(
    "slideshow-generation",
    1,
    "validate-input",
    "Validate generation input",
    "storage",
    "Load and normalize owner-scoped generation inputs, then reject incomplete configurations."
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
    { provider: "OpenRouter", model: "configured slideshowTextModel" }
  ),
  stage(
    "slideshow-generation",
    7,
    "retry-text-similarity",
    "Retry similar text",
    "provider",
    "Compare with reuse memory and perform the single authoritative rewrite when needed.",
    {
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
    "Render SVG slides to PNG and persist durable artifact references."
  ),
  stage(
    "slideshow-generation",
    14,
    "render-store-mp4",
    "Render and store MP4",
    "provider",
    "Render and persist an H.264 slideshow video when requested.",
    { provider: "Rendi", model: "FFmpeg", optional: true }
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
    "Finalize result/run state and append reuse-memory records."
  ),

  stage(
    "ugc-video-generation",
    1,
    "analyze-product",
    "Analyze product",
    "provider",
    "Fetch the guarded public product page and extract grounded product facts.",
    { provider: "public HTTP + OpenRouter", model: "openai/gpt-5.4-mini" }
  ),
  stage(
    "ugc-video-generation",
    2,
    "generate-script-plan",
    "Generate script plan",
    "provider",
    "Generate and validate hook, spoken phases, timing, and b-roll prompts.",
    { provider: "OpenRouter", model: "anthropic/claude-sonnet-5" }
  ),
  stage(
    "ugc-video-generation",
    3,
    "resolve-generate-actor",
    "Resolve or generate actor",
    "provider",
    "Resolve a configured actor or generate and persist a portrait.",
    { provider: "fal.ai or configured asset", model: "fal-ai/flux-2-pro" }
  ),
  stage(
    "ugc-video-generation",
    4,
    "synthesize-voice",
    "Synthesize voice",
    "provider",
    "Synthesize speech with word timestamps and persist durable audio references.",
    { provider: "ElevenLabs", model: "configured voice model" }
  ),
  stage(
    "ugc-video-generation",
    5,
    "animate-actor",
    "Animate actor",
    "provider",
    "Animate the durable actor image and persist the source performance.",
    {
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
    { provider: "fal.ai", model: "fal-ai/flux-2-pro" }
  ),
  stage(
    "ugc-video-generation",
    8,
    "composite-output",
    "Composite output",
    "provider",
    "Build captions and overlays, render the final MP4, and persist its thumbnail.",
    { provider: "Rendi", model: "FFmpeg" }
  ),
  stage(
    "ugc-video-generation",
    9,
    "store-final-output",
    "Store final output",
    "storage",
    "Upsert the canonical output and output-media rows with provider provenance."
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
    { provider: "OpenRouter", model: "requested post model" }
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
    "Repeat the registered planning through repair stages until the requested batch is complete."
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
    { provider: "OpenRouter", model: "automation generation model" }
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
    "Persist the owner-scoped draft, reminder, and bounded reuse memory."
  ),
  stage(
    "x-threads-generation",
    12,
    "generate-image",
    "Generate image",
    "provider",
    "Generate, download, persist, and attach an optional draft image.",
    { provider: "KIE.ai", model: "nano-banana-pro", optional: true }
  ),
] as const satisfies readonly PipelineStageMetadata[]

export function pipelineStagesForWorkflow(workflowId: PipelineWorkflowId) {
  return PIPELINE_STAGE_CATALOG.filter(
    (candidate) => candidate.workflowId === workflowId
  ).sort((left, right) => left.order - right.order)
}

export function pipelineStageId(workflowId: PipelineWorkflowId, name: string) {
  return `${workflowId}.${name}`
}

function stage(
  workflowId: PipelineWorkflowId,
  order: number,
  name: string,
  title: string,
  kind: PipelineStageKind,
  description: string,
  detail: Pick<PipelineStageMetadata, "provider" | "model" | "optional"> = {}
): PipelineStageMetadata {
  return {
    id: pipelineStageId(workflowId, name),
    workflowId,
    order,
    title,
    kind,
    description,
    ...detail,
  }
}
