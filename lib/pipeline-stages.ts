import { z } from "zod"

import type { ProviderRequestTrace } from "@/lib/provider-request-trace"

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
  providerRequests?: ProviderRequestTrace[]
}

export const PIPELINE_WORKFLOW_IDS = [
  "slideshow-generation",
  "ugc-video-generation",
  "react-reveal-generation",
  "greenscreen-meme-generation",
  "template-video-generation",
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
    "apply-fixed-slide-count",
    "Apply fixed slide count",
    "deterministic",
    "Apply the template's fixed total slide count without model or hook overrides."
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

  stage(
    "slideshow-generation",
    101,
    "load-automation-record",
    "Load automation record",
    "storage",
    "Load one owner-scoped automation through the registered document-read stage.",
    { ...compositeStage, workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    102,
    "list-image-collections",
    "List image collections",
    "storage",
    "Page through owner-scoped image collections using registered page reads.",
    { ...compositeStage, workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    103,
    "list-word-collections",
    "List word collections",
    "storage",
    "Page through owner-scoped word collections using registered page reads.",
    { ...compositeStage, workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    104,
    "list-usage-history",
    "List usage history",
    "storage",
    "Page through owner-scoped usage history using registered page reads.",
    { ...compositeStage, workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    105,
    "list-prior-runs",
    "List prior runs",
    "storage",
    "Page through owner-scoped automation runs using registered page reads.",
    { ...compositeStage, workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    106,
    "load-model-settings",
    "Load model settings",
    "storage",
    "Load model settings through the registered fixed-document read.",
    { ...compositeStage, workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    116,
    "prepare-generation-context",
    "Prepare generation memory and model context",
    "deterministic",
    "Normalize hook, text, heading, and image reuse memory with the selected slideshow text model.",
    { workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    117,
    "prepare-image-candidate-pools",
    "Prepare static image candidate pools",
    "deterministic",
    "Resolve each slide's configured collection into a bounded static candidate pool without reading generated text.",
    { workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    118,
    "list-media-collection-options",
    "List media collection options",
    "storage",
    "Return bounded collection IDs, labels, media types, and asset counts for generated Windmill selectors.",
    { ...compositeStage, workflowStep: false }
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
  stage(
    "slideshow-generation",
    111,
    "upsert-automation-run",
    "Persist automation run",
    "storage",
    "Create or update one automation run through registered one-request document stages.",
    { ...compositeStage, workflowStep: false }
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
    "slideshow-generation",
    113,
    "prepare-video-render",
    "Prepare video render",
    "storage",
    "Stage rendered PNG inputs locally for resumable provider upload.",
    { ...compositeStage, sideEffect: "storage", workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    114,
    "finalize-video-render",
    "Finalize video render",
    "storage",
    "Attach persisted video artifacts to the slideshow result.",
    { ...compositeStage, sideEffect: "storage", workflowStep: false }
  ),
  stage(
    "slideshow-generation",
    115,
    "build-rendi-video-command",
    "Build Rendi video command",
    "deterministic",
    "Build the slideshow FFmpeg command from completed Rendi slide uploads.",
    { workflowStep: false }
  ),
  ...rendiProtocolStages("slideshow-generation", 120),

  stage(
    "ugc-video-generation",
    0,
    "resolve-components",
    "Resolve generation components",
    "storage",
    "Load an optional UGC template and merge explicit product, script, actor, voice, b-roll, and render overrides.",
    compositeStage
  ),
  stage(
    "ugc-video-generation",
    8,
    "load-template-defaults",
    "Load UGC template defaults",
    "storage",
    "Load and validate an optional UGC template and expose its component defaults.",
    compositeStage
  ),
  ...[
    ["product", "product URL, brief, or supplied analysis"],
    ["script", "script plan and target duration"],
    ["actor", "actor source, portrait, and motion prompt"],
    ["voice", "voice identifier and model"],
    ["broll", "B-roll enablement and image count"],
    ["render", "aspect ratio, lip-sync tier, captions, and hook overlay"],
  ].map(([name, description], index) =>
    stage(
      "ugc-video-generation",
      9 + index,
      `resolve-${name}-component`,
      `Resolve ${name} component`,
      "deterministic",
      `Merge and validate the ${description} component from template defaults and the per-run override.`,
      { workflowStep: false }
    )
  ),
  stage(
    "ugc-video-generation",
    15,
    "assemble-performance",
    "Assemble performance artifacts",
    "deterministic",
    "Create one typed performance artifact from isolated voice and lip-sync checkpoint outputs.",
    { workflowStep: false }
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
  atomicStage(
    "ugc-video-generation",
    115,
    "elevenlabs-synthesize-speech",
    "provider",
    "ElevenLabs speech with timestamps",
    "Perform one ElevenLabs synthesis request and stage decoded outputs locally.",
    { provider: "ElevenLabs", model: "configured voice model" }
  ),
  atomicStage(
    "ugc-video-generation",
    116,
    "persist-voice-audio",
    "storage",
    "Appwrite voice asset-file create",
    "Persist one locally staged voice audio file."
  ),
  atomicStage(
    "ugc-video-generation",
    117,
    "persist-voice-timings",
    "storage",
    "Appwrite timings asset-file create",
    "Persist one locally staged word-timing file."
  ),
  stage(
    "ugc-video-generation",
    118,
    "synthesize-voice-assets",
    "Synthesize and persist voice assets",
    "provider",
    "Invoke registered ElevenLabs, audio-persistence, and timing-persistence stages.",
    { ...compositeStage, provider: "ElevenLabs", workflowStep: false }
  ),
  stage(
    "ugc-video-generation",
    119,
    "build-rendi-composite-command",
    "Build UGC Rendi composite command",
    "deterministic",
    "Build captions and the FFmpeg request from explicit actor and b-roll inputs, staging only local caption text.",
    { workflowStep: false }
  ),
  stage(
    "ugc-video-generation",
    120,
    "render-rendi-composite",
    "Render one UGC Rendi composite",
    "provider",
    "Drive prepared UGC files through registered Rendi upload, command, download, and persistence stages.",
    {
      ...compositeStage,
      provider: "Rendi",
      model: "FFmpeg",
      workflowStep: false,
    }
  ),
  stage(
    "ugc-video-generation",
    121,
    "discard-voice-temp",
    "Discard voice temp files",
    "deterministic",
    "Remove locally staged ElevenLabs audio and timing files after persistence.",
    { workflowStep: false }
  ),
  ...rendiProtocolStages("ugc-video-generation", 130),

  ...fixedVideoFormatStages(
    "react-reveal-generation",
    "anticipation",
    "reveal",
    "Resolve an optional React & Reveal template plus explicit clip, caption, audio, and output components."
  ),
  ...fixedVideoFormatStages(
    "greenscreen-meme-generation",
    "meme",
    "background",
    "Resolve an optional Greenscreen Meme template plus explicit meme clip, background, caption, audio, and output components."
  ),

  ...[
    [
      1,
      "load-template",
      "Load video template",
      "Load and validate the saved generic video template.",
    ],
    [
      2,
      "generate-copy",
      "Generate video copy",
      "Select and expand the hook, then generate captions and publish-gate metadata.",
    ],
    [
      3,
      "resolve-media",
      "Resolve template media",
      "Resolve every segment to its configured collection, demo asset, or composed slideshow output.",
    ],
    [
      4,
      "assemble-components",
      "Assemble render components",
      "Join independently generated copy and resolved media at their first common renderer consumer.",
    ],
    [
      5,
      "stage-media",
      "Stage render media",
      "Download the selected media inputs into isolated render staging.",
    ],
    [
      6,
      "build-render-command",
      "Build template render command",
      "Build the FFmpeg render plan while preserving segment order, duration, full-play, captions, and audio settings.",
    ],
    [
      7,
      "render-store-output",
      "Render and store video",
      "Render the generic video with Rendi and persist video and thumbnail artifacts.",
    ],
    [
      8,
      "finalize-output",
      "Finalize video draft",
      "Persist the canonical unpublished video output.",
    ],
    [
      9,
      "discard-staged-media",
      "Discard staged media",
      "Remove temporary source files after the output is durable.",
    ],
    [
      101,
      "stage-one-media",
      "Stage one media input",
      "Download exactly one selected template-media input.",
    ],
  ].map(([order, name, title, description]) =>
    stage(
      "template-video-generation",
      order as number,
      name as string,
      title as string,
      name === "generate-copy" || name === "render-store-output"
        ? "provider"
        : name === "load-template" || name === "finalize-output"
          ? "storage"
          : "deterministic",
      description as string,
      [
        "load-template",
        "stage-media",
        "render-store-output",
        "finalize-output",
      ].includes(name as string)
        ? compositeStage
        : name === "stage-one-media"
          ? {
              granularity: "atomic",
              sideEffect: "network",
              operation: "remote media HTTP download",
              maxExternalCalls: 1,
              workflowStep: false,
            }
          : undefined
    )
  ),
  ...rendiProtocolStages("template-video-generation", 120),

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
    103,
    "normalize-audience-topic",
    "Normalize audience and topic",
    "deterministic",
    "Require the niche and normalize topic and excluded-topic controls.",
    { workflowStep: false }
  ),
  stage(
    "linkedin-generation",
    104,
    "normalize-voice-proof",
    "Normalize voice and proof",
    "deterministic",
    "Normalize the persona, proof bank, optional planning overrides, and post model.",
    { workflowStep: false }
  ),
  stage(
    "linkedin-generation",
    105,
    "normalize-brief-controls",
    "Normalize brief controls",
    "deterministic",
    "Validate an optional supplied brief and normalize the brief model.",
    { workflowStep: false }
  ),
  stage(
    "linkedin-generation",
    106,
    "normalize-batch-controls",
    "Normalize batch controls",
    "deterministic",
    "Clamp the requested post count to the supported batch range.",
    { workflowStep: false }
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
    116,
    "load-template",
    "Load X/Threads template",
    "storage",
    "Load and validate the selected owner-scoped X/Threads template.",
    compositeStage
  ),
  stage(
    "x-threads-generation",
    117,
    "normalize-run-input",
    "Normalize per-run content input",
    "deterministic",
    "Normalize the optional topic and structured source candidate independently of template loading.",
    { workflowStep: false }
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
  stage(
    "x-threads-generation",
    102,
    "persist-run",
    "Persist run",
    "storage",
    "Create or update one X/Threads run and synchronize media through registered one-request stages.",
    { ...compositeStage, workflowStep: false }
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
  stage(
    "x-threads-generation",
    104,
    "persist-usage-memory",
    "Persist usage memory",
    "storage",
    "Create or update bounded usage memory through registered document stages.",
    { ...compositeStage, workflowStep: false }
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
  stage(
    "x-threads-generation",
    109,
    "persist-image-run",
    "Persist image run",
    "storage",
    "Attach one generated image by invoking the registered run persistence composite.",
    { ...compositeStage, workflowStep: false }
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
  ...pipelineStorageBoundaryStages(),
] as const satisfies readonly PipelineStageMetadata[]

function pipelineStorageBoundaryStages(): PipelineStageMetadata[] {
  const atomic = (
    workflowId: PipelineWorkflowId,
    order: number,
    name: string,
    operation: string,
    description: string
  ) => atomicStage(workflowId, order, name, "storage", operation, description)
  return [
    atomic(
      "slideshow-generation",
      201,
      "get-automation-document",
      "Template store templates getRow",
      "Read exactly one owner-scoped slideshow template row."
    ),
    atomic(
      "slideshow-generation",
      202,
      "list-image-collections-page",
      "Appwrite permanent_assets listRows",
      "Read exactly one owner-scoped image-collection page."
    ),
    atomic(
      "slideshow-generation",
      203,
      "list-word-collections-page",
      "Appwrite permanent_assets listRows",
      "Read exactly one owner-scoped word-collection page."
    ),
    atomic(
      "slideshow-generation",
      204,
      "list-usage-history-page",
      "Appwrite usage_ledger listRows",
      "Read exactly one owner-scoped usage page."
    ),
    atomic(
      "slideshow-generation",
      205,
      "list-prior-runs-page",
      "Template store template_runs listRows",
      "Read exactly one owner-scoped automation-run page."
    ),
    atomic(
      "slideshow-generation",
      206,
      "get-result-document",
      "Appwrite outputs getRow",
      "Read exactly one owner-scoped slideshow result row."
    ),
    atomic(
      "slideshow-generation",
      207,
      "create-result-document",
      "Appwrite outputs createRow",
      "Create exactly one owner-scoped slideshow result row."
    ),
    atomic(
      "slideshow-generation",
      208,
      "update-result-document",
      "Appwrite outputs updateRow",
      "Update exactly one owner-scoped slideshow result row."
    ),
    atomic(
      "slideshow-generation",
      209,
      "list-result-media-page",
      "Appwrite output_media listRows",
      "Read exactly one media page for one owner-scoped result."
    ),
    atomic(
      "slideshow-generation",
      210,
      "create-one-result-media",
      "Appwrite output_media createRow",
      "Create exactly one media row for one slideshow result."
    ),
    atomic(
      "slideshow-generation",
      211,
      "delete-one-result-media",
      "Appwrite output_media deleteRow",
      "Delete exactly one media row obtained from an owner-scoped result page."
    ),
    atomic(
      "slideshow-generation",
      212,
      "read-one-source-asset",
      "Appwrite Storage getFileView",
      "Read one permitted slideshow source object into local staging."
    ),
    atomic(
      "slideshow-generation",
      213,
      "create-one-output-asset",
      "Appwrite Storage createFile",
      "Create one slideshow output object from local staging."
    ),
    atomic(
      "slideshow-generation",
      214,
      "delete-one-output-asset",
      "Appwrite Storage deleteFile",
      "Delete one slideshow output object before an explicit replacement attempt."
    ),
    stage(
      "slideshow-generation",
      215,
      "persist-result-media",
      "Persist result media",
      "storage",
      "Replace result media using registered page, delete, and create stages.",
      { ...compositeStage, workflowStep: false }
    ),
    atomic(
      "slideshow-generation",
      216,
      "get-model-settings-document",
      "Appwrite permanent_assets getRow",
      "Read exactly one owner-scoped generation-model settings row."
    ),
    atomicStage(
      "slideshow-generation",
      217,
      "download-one-source-asset",
      "provider",
      "slideshow source HTTP GET",
      "Download exactly one remote slideshow source into local staging.",
      { provider: "remote asset host" }
    ),
    atomic(
      "slideshow-generation",
      218,
      "get-one-post-intent",
      "Appwrite posts getRow",
      "Read exactly one owner-scoped generated post-intent row."
    ),
    atomic(
      "slideshow-generation",
      219,
      "create-one-post-intent",
      "Appwrite posts createRow",
      "Create exactly one owner-scoped generated post-intent row."
    ),
    atomic(
      "slideshow-generation",
      220,
      "update-one-post-intent",
      "Appwrite posts updateRow",
      "Update exactly one owner-scoped generated post-intent row."
    ),
    atomic(
      "slideshow-generation",
      221,
      "get-one-post-identity",
      "Appwrite post_identities getRow",
      "Read exactly one owner-scoped generated post identity."
    ),
    atomic(
      "slideshow-generation",
      222,
      "create-one-post-identity",
      "Appwrite post_identities createRow",
      "Create exactly one owner-scoped generated post identity."
    ),
    stage(
      "slideshow-generation",
      223,
      "persist-post-intents",
      "Persist post intents",
      "storage",
      "Persist generated post intents through registered identity and post document stages.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      224,
      "prepare-png-render",
      "Prepare PNG render",
      "deterministic",
      "Normalize a slideshow record and initialize resumable local scratch state.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      225,
      "stage-render-assets",
      "Stage render assets",
      "storage",
      "Stage each source, overlay, and icon through a registered singular read or download stage.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      226,
      "render-one-slide-png",
      "Render one slide PNG",
      "deterministic",
      "Render one slide locally from already staged inputs.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      227,
      "render-all-slide-pngs",
      "Render all slide PNGs",
      "deterministic",
      "Invoke the singular registered renderer once per slide.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      228,
      "list-render-output-files",
      "List render output files",
      "deterministic",
      "List the bounded local render files that require persistence.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      229,
      "persist-render-output-files",
      "Persist render output files",
      "storage",
      "Create each output object through the registered singular storage stage, with explicit delete/create replacement.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      230,
      "assemble-rendered-slideshow",
      "Assemble rendered slideshow",
      "deterministic",
      "Assemble durable output URLs and staged source references into the slideshow record.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      231,
      "persist-slideshow-result",
      "Persist slideshow result",
      "storage",
      "Create or update a result row, synchronize each media row, and persist post intents through registered children.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      232,
      "discard-png-render",
      "Discard PNG render",
      "deterministic",
      "Remove bounded local slideshow scratch state.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      233,
      "build-result-record",
      "Build result record",
      "deterministic",
      "Build the canonical result payload and media drafts without storage access.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      234,
      "prepare-post-intents",
      "Prepare post intents",
      "deterministic",
      "Build owner-scoped generated post intents without storage access.",
      { workflowStep: false }
    ),
    atomic(
      "slideshow-generation",
      235,
      "list-results-page",
      "Appwrite outputs listRows",
      "Read exactly one owner-scoped slideshow result page."
    ),
    stage(
      "slideshow-generation",
      236,
      "find-result-for-slideshow",
      "Find result for slideshow",
      "storage",
      "Page through registered result reads until the requested slideshow result is found.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      237,
      "initialize-video-preparation",
      "Initialize video preparation",
      "deterministic",
      "Build resumable local video input paths from a hydrated slideshow result.",
      { workflowStep: false }
    ),
    atomic(
      "slideshow-generation",
      238,
      "read-one-video-slide",
      "Appwrite Storage getFileView",
      "Read exactly one rendered slideshow PNG into local video staging."
    ),
    stage(
      "slideshow-generation",
      239,
      "stage-video-slides",
      "Stage video slides",
      "storage",
      "Stage every rendered PNG through the singular registered storage read.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      240,
      "build-finalized-video-result",
      "Build finalized video result",
      "deterministic",
      "Attach persisted video and thumbnail URLs to a supplied result record.",
      { workflowStep: false }
    ),
    atomic(
      "slideshow-generation",
      241,
      "get-automation-run-document",
      "Template store template_runs getRow",
      "Read exactly one owner-scoped slideshow template-run row."
    ),
    atomic(
      "slideshow-generation",
      242,
      "create-automation-run-document",
      "Template store template_runs createRow",
      "Create exactly one owner-scoped slideshow template-run row."
    ),
    atomic(
      "slideshow-generation",
      243,
      "update-automation-run-document",
      "Template store template_runs updateRow",
      "Update exactly one owner-scoped slideshow template-run row."
    ),
    stage(
      "slideshow-generation",
      244,
      "enrich-collection-usage",
      "Enrich collection usage",
      "deterministic",
      "Attach latest supplied image-usage timestamps to supplied collection candidates.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      245,
      "prepare-one-usage-record",
      "Prepare one usage record",
      "deterministic",
      "Normalize and assign the deterministic ID for one supplied usage record.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      246,
      "prepare-post-identity-claims",
      "Prepare post identity claims",
      "deterministic",
      "Derive canonical identity claims for one supplied post intent.",
      { workflowStep: false }
    ),
    stage(
      "slideshow-generation",
      247,
      "prepare-video-thumbnail",
      "Prepare video thumbnail",
      "deterministic",
      "Copy the first staged slide into the local thumbnail input without a remote call.",
      { workflowStep: false }
    ),

    atomic(
      "ugc-video-generation",
      301,
      "get-saved-run-document",
      "Template store template_runs getRow",
      "Read exactly one owner-scoped saved UGC checkpoint row."
    ),
    atomic(
      "ugc-video-generation",
      302,
      "create-saved-run-document",
      "Template store template_runs createRow",
      "Create exactly one owner-scoped saved UGC checkpoint row."
    ),
    atomic(
      "ugc-video-generation",
      303,
      "update-saved-run-document",
      "Template store template_runs updateRow",
      "Update exactly one owner-scoped saved UGC checkpoint row."
    ),
    atomic(
      "ugc-video-generation",
      304,
      "inspect-one-saved-asset",
      "Appwrite Storage getFile",
      "Inspect exactly one owner-scoped durable UGC asset."
    ),
    atomic(
      "ugc-video-generation",
      305,
      "read-one-saved-asset",
      "Appwrite Storage getFileView",
      "Read exactly one owner-scoped durable UGC asset into local staging."
    ),
    atomic(
      "ugc-video-generation",
      306,
      "create-one-saved-asset",
      "Appwrite Storage createFile",
      "Create exactly one owner-scoped durable UGC asset."
    ),
    atomic(
      "ugc-video-generation",
      307,
      "delete-one-saved-asset",
      "Appwrite Storage deleteFile",
      "Delete exactly one owner-scoped durable UGC asset before replacement."
    ),
    atomic(
      "ugc-video-generation",
      308,
      "get-final-output-document",
      "Appwrite outputs getRow",
      "Read exactly one owner-scoped UGC output row."
    ),
    atomic(
      "ugc-video-generation",
      309,
      "create-final-output-document",
      "Appwrite outputs createRow",
      "Create exactly one owner-scoped UGC output row."
    ),
    atomic(
      "ugc-video-generation",
      310,
      "update-final-output-document",
      "Appwrite outputs updateRow",
      "Update exactly one owner-scoped UGC output row."
    ),
    atomic(
      "ugc-video-generation",
      311,
      "list-final-output-media-page",
      "Appwrite output_media listRows",
      "Read exactly one media page for one owner-scoped UGC output."
    ),
    atomic(
      "ugc-video-generation",
      312,
      "create-one-final-output-media",
      "Appwrite output_media createRow",
      "Create exactly one UGC output-media row."
    ),
    atomic(
      "ugc-video-generation",
      313,
      "delete-one-final-output-media",
      "Appwrite output_media deleteRow",
      "Delete exactly one UGC output-media row returned by an owner-scoped page."
    ),
    stage(
      "ugc-video-generation",
      314,
      "save-checkpoint",
      "Save checkpoint",
      "storage",
      "Create or update resumable UGC checkpoint state through registered document stages.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "ugc-video-generation",
      315,
      "replace-one-saved-asset",
      "Replace one saved asset",
      "storage",
      "Replace one UGC asset through registered inspect/delete/create stages.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "ugc-video-generation",
      316,
      "persist-final-output-media",
      "Persist final output media",
      "storage",
      "Replace UGC output media through registered page, delete, and create stages.",
      { ...compositeStage, workflowStep: false }
    ),
    atomic(
      "ugc-video-generation",
      317,
      "get-saved-automation-document",
      "Template store templates getRow",
      "Read exactly one owner-scoped UGC automation row."
    ),
    atomic(
      "ugc-video-generation",
      318,
      "get-usage-document",
      "Appwrite usage_ledger getRow",
      "Read exactly one owner-scoped UGC usage row."
    ),
    atomic(
      "ugc-video-generation",
      319,
      "create-usage-document",
      "Appwrite usage_ledger createRow",
      "Create exactly one owner-scoped UGC usage row."
    ),
    atomic(
      "ugc-video-generation",
      320,
      "update-usage-document",
      "Appwrite usage_ledger updateRow",
      "Update exactly one owner-scoped UGC usage row."
    ),
    stage(
      "ugc-video-generation",
      321,
      "persist-usage-record",
      "Persist usage record",
      "storage",
      "Create or update one UGC usage record through registered document stages.",
      { ...compositeStage, workflowStep: false }
    ),
    atomic(
      "ugc-video-generation",
      322,
      "create-generated-notification-job",
      "Appwrite jobs createRow",
      "Create exactly one owner-scoped generated-output reminder job."
    ),
    atomic(
      "ugc-video-generation",
      323,
      "delete-one-broll-asset",
      "Appwrite Storage deleteFile",
      "Delete exactly one fixed-domain b-roll object before an explicit create retry."
    ),
    stage(
      "ugc-video-generation",
      324,
      "prepare-final-output-document",
      "Prepare final output document",
      "deterministic",
      "Build the fixed-domain UGC output row and media drafts from supplied final output state.",
      { workflowStep: false }
    ),
    stage(
      "ugc-video-generation",
      325,
      "persist-final-output",
      "Persist final output",
      "storage",
      "Create or update the UGC output, synchronize media, and enqueue its reminder through registered children.",
      { ...compositeStage, workflowStep: false }
    ),

    atomic(
      "x-threads-generation",
      201,
      "get-automation-document",
      "Template store social_templates getRow",
      "Read exactly one owner-scoped X/Threads template row."
    ),
    atomic(
      "x-threads-generation",
      202,
      "create-automation-document",
      "Template store social_templates createRow",
      "Create exactly one owner-scoped X/Threads template row."
    ),
    atomic(
      "x-threads-generation",
      203,
      "update-automation-document",
      "Template store social_templates updateRow",
      "Update exactly one owner-scoped X/Threads template row."
    ),
    atomic(
      "x-threads-generation",
      204,
      "get-run-document",
      "Appwrite outputs getRow",
      "Read exactly one owner-scoped X/Threads run row."
    ),
    atomic(
      "x-threads-generation",
      205,
      "create-run-document",
      "Appwrite outputs createRow",
      "Create exactly one owner-scoped X/Threads run row."
    ),
    atomic(
      "x-threads-generation",
      206,
      "update-run-document",
      "Appwrite outputs updateRow",
      "Update exactly one owner-scoped X/Threads run row."
    ),
    atomic(
      "x-threads-generation",
      207,
      "list-run-media-page",
      "Appwrite output_media listRows",
      "Read exactly one media page for one owner-scoped X/Threads run."
    ),
    atomic(
      "x-threads-generation",
      208,
      "create-one-run-media",
      "Appwrite output_media createRow",
      "Create exactly one X/Threads run-media row."
    ),
    atomic(
      "x-threads-generation",
      209,
      "delete-one-run-media",
      "Appwrite output_media deleteRow",
      "Delete exactly one X/Threads run-media row returned by an owner-scoped page."
    ),
    stage(
      "x-threads-generation",
      210,
      "persist-run-media",
      "Persist run media",
      "storage",
      "Replace X/Threads run media through registered page, delete, and create stages.",
      { ...compositeStage, workflowStep: false }
    ),
    stage(
      "x-threads-generation",
      211,
      "prepare-run-document",
      "Prepare run document",
      "deterministic",
      "Build the owner-scoped X/Threads output row and media drafts without storage access.",
      { workflowStep: false }
    ),
    atomic(
      "x-threads-generation",
      212,
      "delete-image-asset",
      "Appwrite Storage deleteFile",
      "Delete exactly one fixed-domain generated image before an explicit create retry."
    ),
    stage(
      "x-threads-generation",
      213,
      "build-usage-memory-update",
      "Build usage memory update",
      "deterministic",
      "Build the bounded X/Threads automation usage-memory update locally.",
      { workflowStep: false }
    ),
    stage(
      "x-threads-generation",
      214,
      "attach-image-to-run",
      "Attach image to run",
      "deterministic",
      "Attach one durable image URL to a supplied X/Threads run locally.",
      { workflowStep: false }
    ),
  ]
}

export function pipelineStagesForWorkflow(workflowId: PipelineWorkflowId) {
  return PIPELINE_STAGE_CATALOG.filter(
    (candidate) =>
      candidate.workflowId === workflowId && candidate.workflowStep !== false
  ).sort((left, right) => left.order - right.order)
}

export function pipelineStageId(workflowId: PipelineWorkflowId, name: string) {
  return `${workflowId}.${name}`
}

function rendiProtocolStages(
  workflowId: PipelineWorkflowId,
  firstOrder: number
): PipelineStageMetadata[] {
  return [
    atomicStage(
      workflowId,
      firstOrder,
      "rendi-init-upload",
      "provider",
      "Rendi init-upload",
      "Initialize one Rendi multipart upload without exposing signed upload URLs.",
      { provider: "Rendi" }
    ),
    atomicStage(
      workflowId,
      firstOrder + 1,
      "rendi-upload-part",
      "provider",
      "Rendi signed part PUT",
      "Upload one part for one initialized Rendi file.",
      { provider: "Rendi" }
    ),
    atomicStage(
      workflowId,
      firstOrder + 2,
      "rendi-complete-upload",
      "provider",
      "Rendi complete-upload",
      "Complete one Rendi multipart upload without polling.",
      { provider: "Rendi" }
    ),
    atomicStage(
      workflowId,
      firstOrder + 3,
      "rendi-get-file",
      "provider",
      "Rendi file status GET",
      "Read one Rendi file status exactly once.",
      { provider: "Rendi" }
    ),
    stage(
      workflowId,
      firstOrder + 4,
      "rendi-upload-file",
      "Upload one file to Rendi",
      "provider",
      "Drive one local file through registered init, part, complete, and status stages.",
      { ...compositeStage, provider: "Rendi", workflowStep: false }
    ),
    atomicStage(
      workflowId,
      firstOrder + 5,
      "rendi-submit-command",
      "provider",
      "Rendi run-ffmpeg-command",
      "Submit one Rendi FFmpeg command without polling.",
      { provider: "Rendi", model: "FFmpeg" }
    ),
    atomicStage(
      workflowId,
      firstOrder + 6,
      "rendi-get-command",
      "provider",
      "Rendi command status GET",
      "Read one Rendi FFmpeg command status exactly once.",
      { provider: "Rendi", model: "FFmpeg" }
    ),
    atomicStage(
      workflowId,
      firstOrder + 7,
      "rendi-download-output",
      "provider",
      "Rendi output HTTP download",
      "Download one Rendi output to local temporary staging.",
      { provider: "Rendi output host" }
    ),
    atomicStage(
      workflowId,
      firstOrder + 8,
      "rendi-persist-output",
      "storage",
      "Appwrite Rendi output-file create",
      "Persist one locally staged Rendi output."
    ),
    stage(
      workflowId,
      firstOrder + 9,
      "rendi-discard-temp",
      "Discard Rendi temp state",
      "deterministic",
      "Remove local Rendi upload-session or output staging files.",
      { workflowStep: false }
    ),
  ]
}

function fixedVideoFormatStages(
  workflowId: Extract<
    PipelineWorkflowId,
    | "react-reveal-generation"
    | "greenscreen-meme-generation"
    | "template-video-generation"
  >,
  primaryRole: string,
  secondaryRole: string,
  resolveDescription: string
): PipelineStageMetadata[] {
  return [
    stage(
      workflowId,
      1,
      "resolve-components",
      "Resolve format components",
      "storage",
      resolveDescription,
      compositeStage
    ),
    stage(
      workflowId,
      9,
      "load-template-defaults",
      "Load format template defaults",
      "storage",
      "Load and validate the optional format template before resolving role-specific components.",
      compositeStage
    ),
    stage(
      workflowId,
      10,
      `resolve-${primaryRole}`,
      `Resolve ${primaryRole}`,
      "deterministic",
      `Merge and validate the ${primaryRole} media component.`,
      { workflowStep: false }
    ),
    stage(
      workflowId,
      11,
      `resolve-${secondaryRole}`,
      `Resolve ${secondaryRole}`,
      "deterministic",
      `Merge and validate the ${secondaryRole} media component.`,
      { workflowStep: false }
    ),
    stage(
      workflowId,
      12,
      "resolve-audio",
      "Resolve optional soundtrack",
      "deterministic",
      "Merge and validate the optional audio component.",
      { workflowStep: false }
    ),
    stage(
      workflowId,
      13,
      "resolve-caption",
      "Resolve format captions",
      "deterministic",
      "Merge and normalize the captions consumed by the format render plan.",
      { workflowStep: false }
    ),
    stage(
      workflowId,
      14,
      "resolve-output",
      "Resolve draft metadata",
      "deterministic",
      "Merge and normalize the title, description, and hashtags consumed when the rendered media becomes a draft output.",
      { workflowStep: false }
    ),
    atomicStage(
      workflowId,
      2,
      `stage-${primaryRole}`,
      "provider",
      "remote media HTTP download",
      `Stage the ${primaryRole} component as one local render input.`,
      { provider: "remote asset host" }
    ),
    atomicStage(
      workflowId,
      3,
      `stage-${secondaryRole}`,
      "provider",
      "remote media HTTP download",
      `Stage the ${secondaryRole} component as one local render input.`,
      { provider: "remote asset host" }
    ),
    atomicStage(
      workflowId,
      4,
      "stage-audio",
      "provider",
      "remote audio HTTP download",
      "Stage the optional soundtrack as one local render input.",
      { provider: "remote asset host", optional: true }
    ),
    stage(
      workflowId,
      5,
      "build-render-command",
      "Build format render command",
      "deterministic",
      "Build the format-specific FFmpeg graph from named, locally staged components."
    ),
    stage(
      workflowId,
      6,
      "render-store-output",
      "Render and store video",
      "provider",
      "Drive named inputs through Rendi upload, FFmpeg rendering, output download, and durable storage.",
      {
        ...compositeStage,
        provider: "Rendi",
        model: "FFmpeg",
      }
    ),
    stage(
      workflowId,
      7,
      "finalize-output",
      "Finalize draft output",
      "storage",
      "Persist the canonical draft video output and its media references without publishing it.",
      { ...compositeStage, sideEffect: "storage" }
    ),
    stage(
      workflowId,
      8,
      "discard-staged-media",
      "Discard staged media",
      "deterministic",
      "Remove local temporary source media after the durable output is complete."
    ),
    ...rendiProtocolStages(workflowId, 100),
  ]
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
