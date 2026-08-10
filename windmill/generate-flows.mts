import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { PipelineWorkflowId } from "../lib/pipeline-stages"

const workflows: Array<{
  id: PipelineWorkflowId
  folder: string
  summary: string
  description: string
}> = [
  {
    id: "slideshow-generation",
    folder: "slideshow_generation__flow",
    summary: "lumenclip - slideshow generation",
    description:
      "Generate a complete slideshow through individually observable and composable stages.",
  },
  {
    id: "ugc-video-generation",
    folder: "ugc_video_generation__flow",
    summary: "lumenclip - UGC video generation",
    description:
      "Generate a UGC product video through individually observable and composable stages.",
  },
  {
    id: "react-reveal-generation",
    folder: "react_reveal_generation__flow",
    summary: "lumenclip - React & Reveal generation",
    description:
      "Play a full anticipation clip followed by a full reveal clip through named media, render, and draft-output components.",
  },
  {
    id: "greenscreen-meme-generation",
    folder: "greenscreen_meme_generation__flow",
    summary: "lumenclip - Greenscreen Meme generation",
    description:
      "Chroma-key a full meme clip over a background with a hook caption through named media, render, and draft-output components.",
  },
  {
    id: "linkedin-generation",
    folder: "linkedin_generation__flow",
    summary: "lumenclip - LinkedIn generation",
    description:
      "Generate LinkedIn posts through individually observable and composable stages.",
  },
  {
    id: "x-threads-generation",
    folder: "x_threads_generation__flow",
    summary: "lumenclip - X and Threads generation",
    description:
      "Generate X or Threads content through individually observable and composable stages.",
  },
]

const pipelineStageModule = pipelineStageModuleSource()

for (const workflow of workflows) {
  const outputPath = path.join(
    import.meta.dirname,
    "f",
    "lumenclip",
    workflow.folder,
    "flow.yaml"
  )
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, workflowFlowYaml(workflow))
}

function workflowFlowYaml(workflow: (typeof workflows)[number]) {
  switch (workflow.id) {
    case "slideshow-generation":
      return slideshowDagFlowYaml(workflow.summary, workflow.description)
    case "ugc-video-generation":
      return ugcComponentFlowYaml(workflow.summary, workflow.description)
    case "react-reveal-generation":
      return fixedVideoFlowYaml(
        workflow.summary,
        workflow.description,
        "react_reveal"
      )
    case "greenscreen-meme-generation":
      return fixedVideoFlowYaml(
        workflow.summary,
        workflow.description,
        "greenscreen_meme"
      )
    case "linkedin-generation":
      return linkedinDagFlowYaml(workflow.summary, workflow.description)
    case "x-threads-generation":
      return xThreadsDagFlowYaml(workflow.summary, workflow.description)
  }
}

function pipelineStageModuleSource() {
  return `type PipelineStageExecution = {
  stage: { id: string; workflowId: string }
  requestId: string
  status: "succeeded" | "running"
  externalCalls: number
  output: Record<string, unknown>
  operation?: Record<string, unknown>
  providerRequests?: Array<Record<string, unknown>>
}

export async function main(
  base_url: string,
  shared_secret: string,
  default_owner_id: string,
  stage_id: string,
  stage_input: Record<string, unknown>,
  owner_id?: string,
  request_id?: string
): Promise<PipelineStageExecution> {
  const resolvedOwnerId = owner_id?.trim() || required("default_owner_id", default_owner_id)
  const resolvedRequestId =
    request_id?.trim() ||
    process.env.WM_ROOT_FLOW_JOB_ID?.trim() ||
    process.env.WM_FLOW_JOB_ID?.trim() ||
    process.env.WM_JOB_ID?.trim() ||
    \`windmill-\${crypto.randomUUID()}\`
  const response = await fetch(
    \`\${required("base_url", base_url).replace(/\\\/$/, "")}/api/internal/windmill/stages/\${encodeURIComponent(stage_id)}\`,
    {
      method: "POST",
      headers: {
        authorization: \`Bearer \${required("shared_secret", shared_secret)}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerId: resolvedOwnerId,
        requestId: resolvedRequestId,
        input: stage_input,
      }),
    }
  )
  const payload = (await response.json().catch(() => null)) as {
    execution?: PipelineStageExecution
    error?: string
    providerRequests?: Array<Record<string, unknown>>
  } | null
  if (!response.ok || !payload?.execution) {
    const providerRequests = payload?.providerRequests?.length
      ? \`\nProvider requests:\n\${JSON.stringify(payload.providerRequests, null, 2)}\`
      : ""
    throw new Error((payload?.error || \`Lumenclip stage request failed with \${response.status}\`) + providerRequests)
  }
  return payload.execution
}

function required(name: string, input: unknown) {
  const value = typeof input === "string" ? input.trim() : ""
  if (!value) throw new Error(\`Lumenclip \${name} is not configured\`)
  return value
}`
}

function linkedinInputSchema() {
  return `  order:
    - niche
    - topic
    - excluded_topics
    - proof
    - persona
    - brief
    - brief_model
    - model
    - count
  properties:
    niche:
      type: string
      title: Niche
      description: The audience or market this content is for.
    topic:
      type: string
      title: Topic
      description: Optional topic for this generation.
    excluded_topics:
      type: array
      title: Excluded topics
      items: { type: string }
    proof:
      type: array
      title: Proof bank
      items: { type: string }
    persona:
      type: string
      title: Voice
      enum:
        - educator
        - practitioner
      default: educator
    brief:
      type: object
      title: Supplied niche brief
    brief_model:
      type: string
      title: Brief model override
    model:
      type: string
      title: Post model override
    count:
      type: integer
      title: Posts
      minimum: 1
      maximum: 4
      default: 1
  required:
    - niche`
}

function dynamicTemplateSelectCode(
  kind: "slideshow" | "ugc" | "video" | "x_threads"
) {
  return `import * as wmill from "windmill-client"

export async function automation_id(filterText = "") {
  const [baseUrlValue, secretValue, ownerIdValue] = await Promise.all([
    wmill.getVariable("f/lumenclip/internal_base_url"),
    wmill.getVariable("f/lumenclip/shared_secret"),
    wmill.getVariable("f/lumenclip/default_owner_id"),
  ])
  const baseUrl = required("internal_base_url", baseUrlValue).replace(/\\/$/, "")
  const secret = required("shared_secret", secretValue)
  const ownerId = required("default_owner_id", ownerIdValue)
  const response = await fetch(\`${"${baseUrl}"}/api/internal/windmill/templates\`, {
    method: "POST",
    headers: {
      authorization: \`Bearer ${"${secret}"}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ownerId, kind: ${JSON.stringify(kind)} }),
  })
  const payload = await response.json()
  if (!response.ok || !Array.isArray(payload.options)) {
    throw new Error(payload.error || \`Template lookup failed with ${"${response.status}"}\`)
  }
  const query = filterText.trim().toLowerCase()
  return query
    ? payload.options.filter((option) => option.label.toLowerCase().includes(query))
    : payload.options
}

function required(name: string, value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new Error(\`Lumenclip variable ${"${name}"} is not configured\`)
  return text
}`
}

function stageNode(input: {
  id: string
  summary: string
  stageId: string
  inputExpr: string
}) {
  return ugcRawStageModule({
    ...input,
    source: pipelineStageModule,
  })
}

function slideshowDagFlowYaml(summary: string, description: string) {
  const validationInputs = `    - id: load_validation_inputs
      summary: "Load inputs consumed together by slideshow validation"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Template schema"
            modules:
${indent(stageNode({ id: "load_template", summary: "Load template schema", stageId: "slideshow-generation.load-automation-record", inputExpr: "({ automationId: flow_input.automation_id })" }), 14)}
          - summary: "Image collections and assets"
            modules:
${indent(stageNode({ id: "load_collections", summary: "Load image collections", stageId: "slideshow-generation.list-image-collections", inputExpr: "({})" }), 14)}
          - summary: "Word variables and hooks"
            modules:
${indent(stageNode({ id: "load_word_collections", summary: "Load word collections", stageId: "slideshow-generation.list-word-collections", inputExpr: "({})" }), 14)}
`
  const validate = stageNode({
    id: "validate_input",
    summary: "Validate template, collections, and word variables",
    stageId: "slideshow-generation.validate-input",
    inputExpr:
      "({ automationId: flow_input.automation_id, automationRecord: results.load_validation_inputs[0].output.automationRecord, collections: results.load_validation_inputs[1].output.collections, wordCollections: results.load_validation_inputs[2].output.wordCollections })",
  })
  const loadGenerationContext = `              - id: load_generation_context
                summary: "Load memory and model inputs consumed by text generation"
                value:
                  type: branchall
                  parallel: true
                  branches:
                    - summary: "Published reuse memory"
                      modules:
${indent(stageNode({ id: "load_usage", summary: "Load usage history", stageId: "slideshow-generation.list-usage-history", inputExpr: "({})" }), 22)}
                    - summary: "Generation model settings"
                      modules:
${indent(stageNode({ id: "load_model_settings", summary: "Load model settings", stageId: "slideshow-generation.load-model-settings", inputExpr: "({})" }), 22)}`
  const context = stageNode({
    id: "prepare_generation_context",
    summary: "Normalize reuse memory and generation model",
    stageId: "slideshow-generation.prepare-generation-context",
    inputExpr:
      "({ ...results.validate_input.output, usageHistory: results.load_generation_context[0].output.usageHistory, generationSettings: results.load_generation_context[1].output.generationSettings })",
  })
  const count = stageNode({
    id: "apply_fixed_slide_count",
    summary: "Apply fixed slide count",
    stageId: "slideshow-generation.apply-fixed-slide-count",
    inputExpr: "results.prepare_generation_context.output",
  })
  const hook = stageNode({
    id: "select_expand_hook",
    summary: "Select and expand hook",
    stageId: "slideshow-generation.select-expand-hook",
    inputExpr: "results.apply_fixed_slide_count.output",
  })
  const research = stageNode({
    id: "research_hook",
    summary: "Research selected hook",
    stageId: "slideshow-generation.research-hook",
    inputExpr: "results.select_expand_hook.output",
  })
  const prompt = stageNode({
    id: "build_text_prompt",
    summary: "Build structured text prompt",
    stageId: "slideshow-generation.build-text-prompt",
    inputExpr: "results.research_hook.output",
  })
  const generate = stageNode({
    id: "generate_slide_text",
    summary: "Generate slide text",
    stageId: "slideshow-generation.generate-slide-text",
    inputExpr: "results.build_text_prompt.output",
  })
  const retry = stageNode({
    id: "retry_text_similarity",
    summary: "Check and repair text similarity",
    stageId: "slideshow-generation.retry-text-similarity",
    inputExpr: "results.generate_slide_text.output",
  })
  const candidatePools = stageNode({
    id: "prepare_image_candidate_pools",
    summary: "Prepare static image candidate pools",
    stageId: "slideshow-generation.prepare-image-candidate-pools",
    inputExpr:
      "({ textAutomation: results.validate_input.output.textAutomation, collections: results.validate_input.output.collections })",
  })
  const shortlists = stageNode({
    id: "build_image_shortlists",
    summary: "Visual path — build image shortlists",
    stageId: "slideshow-generation.build-image-shortlists",
    inputExpr: "results.derive_visual_concepts.output",
  })
  const images = stageNode({
    id: "select_slide_images",
    summary: "Visual path — select slide images",
    stageId: "slideshow-generation.select-slide-images",
    inputExpr: "results.build_image_shortlists.output",
  })
  const split = `    - id: produce_text_and_candidates
      summary: "Generate text while static image pools are prepared"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Text generation"
            modules:
${loadGenerationContext}
${indent(context, 14)}
${indent(count, 14)}
${indent(hook, 14)}
${indent(research, 14)}
${indent(prompt, 14)}
${indent(generate, 14)}
${indent(retry, 14)}
          - summary: "Static image candidate preparation"
            modules:
${indent(candidatePools, 14)}`
  const concepts = stageNode({
    id: "derive_visual_concepts",
    summary: "Derive concepts from accepted text and eligible candidate pools",
    stageId: "slideshow-generation.derive-visual-concepts",
    inputExpr:
      "({ ...results.produce_text_and_candidates[0].output, candidatesBySlide: results.produce_text_and_candidates[1].output.candidatesBySlide })",
  })
  const assemble = stageNode({
    id: "assemble_plan",
    summary: "Join text and images into slide plan",
    stageId: "slideshow-generation.assemble-plan",
    inputExpr: "results.select_slide_images.output",
  })
  const translate = stageNode({
    id: "translate_plan",
    summary: "Translate displayed text",
    stageId: "slideshow-generation.translate-plan",
    inputExpr: "results.assemble_plan.output",
  })
  const png = stageNode({
    id: "render_store_pngs",
    summary: "Render and persist slide PNGs",
    stageId: "slideshow-generation.render-store-pngs",
    inputExpr: "results.translate_plan.output",
  })
  const mp4 = stageNode({
    id: "render_store_mp4",
    summary: "Render optional slideshow MP4",
    stageId: "slideshow-generation.render-store-mp4",
    inputExpr: "results.render_store_pngs.output",
  })
  const renderAndQa = `    - id: render_and_qa_context
      summary: "Render output while prior-run QA context loads"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Rendered slideshow artifacts"
            modules:
${indent(png, 14)}
${indent(mp4, 14)}
          - summary: "Prior-run QA context"
            modules:
${indent(stageNode({ id: "load_prior_runs", summary: "Load prior runs for output QA", stageId: "slideshow-generation.list-prior-runs", inputExpr: "({ automationId: flow_input.automation_id })" }), 14)}`
  const qa = stageNode({
    id: "validate_output",
    summary: "Validate generated output",
    stageId: "slideshow-generation.validate-output",
    inputExpr:
      "({ ...results.render_and_qa_context[0].output, priorRuns: results.render_and_qa_context[1].output.priorRuns })",
  })
  const finalize = stageNode({
    id: "finalize_output",
    summary: "Persist run, output, media and reuse memory",
    stageId: "slideshow-generation.finalize-output",
    inputExpr: "results.validate_output.output",
  })
  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${validationInputs}
${validate}
${split}
${concepts}
${shortlists}
${images}
${assemble}
${translate}
${renderAndQa}
${qa}
${finalize}
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    automation_id:
      type: object
      format: dynselect-automation_id
      title: Template
  required: [automation_id]
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(dynamicTemplateSelectCode("slideshow"))}
`
}

function linkedinDagFlowYaml(summary: string, description: string) {
  const inputGroups = `    - id: resolve_input_groups
      summary: "Normalize independent LinkedIn input groups"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Audience and topic"
            modules:
${indent(stageNode({ id: "normalize_audience_topic", summary: "Require niche and normalize topic controls", stageId: "linkedin-generation.normalize-audience-topic", inputExpr: "({ niche: flow_input.niche, topic: flow_input.topic, excludedTopics: flow_input.excluded_topics })" }), 14)}
          - summary: "Voice and persona"
            modules:
${indent(stageNode({ id: "normalize_voice_proof", summary: "Normalize persona, proof, and post model", stageId: "linkedin-generation.normalize-voice-proof", inputExpr: "({ persona: flow_input.persona, proof: flow_input.proof, archetypeId: flow_input.archetype_id, hookStyleId: flow_input.hook_style_id, pillar: flow_input.pillar, model: flow_input.model })" }), 14)}
          - summary: "Brief controls"
            modules:
${indent(stageNode({ id: "normalize_brief_controls", summary: "Validate supplied brief and brief model", stageId: "linkedin-generation.normalize-brief-controls", inputExpr: "({ brief: flow_input.brief, briefModel: flow_input.brief_model })" }), 14)}
          - summary: "Batch controls"
            modules:
${indent(stageNode({ id: "normalize_batch_controls", summary: "Clamp requested batch count", stageId: "linkedin-generation.normalize-batch-controls", inputExpr: "({ count: flow_input.count })" }), 14)}`
  const modules = [
    [
      "validate_input",
      "Join and normalize LinkedIn inputs",
      "validate-input",
      "({ audience: results.resolve_input_groups[0].output.audience, voiceProof: results.resolve_input_groups[1].output.voiceProof, briefControls: results.resolve_input_groups[2].output.briefControls, batchControls: results.resolve_input_groups[3].output.batchControls })",
    ],
    [
      "resolve_brief",
      "Resolve niche brief artifact",
      "resolve-brief",
      "results.validate_input.output",
    ],
    [
      "select_post_plan",
      "Select post plan",
      "select-post-plan",
      "results.resolve_brief.output",
    ],
    [
      "build_generation_request",
      "Build generation request",
      "build-generation-request",
      "results.select_post_plan.output",
    ],
    [
      "generate_compose",
      "Generate and compose draft",
      "generate-compose",
      "results.build_generation_request.output",
    ],
    [
      "validate_draft",
      "Validate draft",
      "validate-draft",
      "results.generate_compose.output",
    ],
    [
      "repair_draft",
      "Repair invalid draft",
      "repair-draft",
      "results.validate_draft.output",
    ],
    [
      "complete_batch",
      "Complete requested batch",
      "complete-batch",
      "results.repair_draft.output",
    ],
  ]
    .map(([id, label, stage, expr]) =>
      stageNode({
        id,
        summary: label,
        stageId: `linkedin-generation.${stage}`,
        inputExpr: expr,
      })
    )
    .join("\n")
  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${inputGroups}
${modules}
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
${linkedinInputSchema()}
`
}

function xThreadsDagFlowYaml(summary: string, description: string) {
  const inputGroups = `    - id: resolve_input_groups
      summary: "Load template while per-run content is normalized"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Saved template reference"
            modules:
${indent(stageNode({ id: "load_template", summary: "Load and validate the saved social template", stageId: "x-threads-generation.load-template", inputExpr: "({ automationId: flow_input.automation_id })" }), 14)}
          - summary: "Per-run content input"
            modules:
${indent(stageNode({ id: "normalize_run_input", summary: "Normalize topic and source candidate", stageId: "x-threads-generation.normalize-run-input", inputExpr: "({ topic: flow_input.topic, sourceCandidate: flow_input.source_candidate, deriveBrief: true })" }), 14)}`
  const sequential = [
    [
      "validate_input",
      "Join template and per-run content",
      "validate-input",
      "({ automationId: results.resolve_input_groups[0].output.automationId, automation: results.resolve_input_groups[0].output.automation, runInput: results.resolve_input_groups[1].output.runInput })",
    ],
    [
      "resolve_brief",
      "Resolve strategy brief artifact",
      "resolve-brief",
      "results.validate_input.output",
    ],
    [
      "select_content_plan",
      "Select content plan",
      "select-content-plan",
      "results.resolve_brief.output",
    ],
    [
      "build_generation_request",
      "Build structured generation request",
      "build-generation-request",
      "results.select_content_plan.output",
    ],
    [
      "generate_draft",
      "Generate structured draft",
      "generate-draft",
      "results.build_generation_request.output",
    ],
    [
      "humanize_draft",
      "Humanize brand voice",
      "humanize-draft",
      "results.generate_draft.output",
    ],
    [
      "review_draft",
      "Review facts and brand constraints",
      "review-draft",
      "results.humanize_draft.output",
    ],
    [
      "validate_draft",
      "Validate platform constraints",
      "validate-draft",
      "results.review_draft.output",
    ],
    [
      "repair_draft",
      "Repair validation failures",
      "repair-draft",
      "results.validate_draft.output",
    ],
    [
      "benchmark_build_run",
      "Benchmark and build draft run",
      "benchmark-build-run",
      "results.repair_draft.output",
    ],
  ]
    .map(([id, label, stage, expr]) =>
      stageNode({
        id,
        summary: label,
        stageId: `x-threads-generation.${stage}`,
        inputExpr: expr,
      })
    )
    .join("\n")
  const persist = stageNode({
    id: "persist_text_run",
    summary: "Persist text run and reuse memory",
    stageId: "x-threads-generation.persist-run-memory",
    inputExpr: "results.benchmark_build_run.output",
  })
  const image = stageNode({
    id: "prepare_image_task",
    summary: "Prepare optional image task",
    stageId: "x-threads-generation.build-image-task",
    inputExpr: "results.benchmark_build_run.output",
  })
  const branch = `    - id: prepare_publishable_artifacts
      summary: "Prepare text persistence and optional image"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Persist validated text output"
            modules:
${indent(persist, 14)}
          - summary: "Prepare optional generated image"
            modules:
${indent(image, 14)}`
  const generateImage = stageNode({
    id: "generate_image",
    summary: "Join persisted text with optional image generation",
    stageId: "x-threads-generation.generate-image",
    inputExpr:
      "({ ...results.prepare_publishable_artifacts[0].output, imageTaskPayload: results.prepare_publishable_artifacts[1].output.imageTaskPayload, imageGenerationSkipped: results.prepare_publishable_artifacts[1].output.imageGenerationSkipped })",
  })
  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${inputGroups}
${sequential}
${branch}
${generateImage}
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    automation_id:
      type: object
      format: dynselect-automation_id
      title: Template
    topic:
      type: string
      title: Topic (optional)
    source_candidate:
      type: object
      title: Source candidate (optional)
      description: Structured source or trend context for this run.
  required: [automation_id]
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(dynamicTemplateSelectCode("x_threads"))}
`
}

function fixedVideoFlowYaml(
  summary: string,
  description: string,
  format: "react_reveal" | "greenscreen_meme"
) {
  const workflowId =
    format === "react_reveal"
      ? "react-reveal-generation"
      : "greenscreen-meme-generation"
  const primary = format === "react_reveal" ? "anticipation" : "meme"
  const secondary = format === "react_reveal" ? "reveal" : "background"
  const loadTemplate = stageNode({
    id: "load_template_defaults",
    summary: "Load and validate optional format template",
    stageId: `${workflowId}.load-template-defaults`,
    inputExpr: "({ templateId: flow_input.template_id })",
  })
  const resolveRole = (role: string) =>
    stageNode({
      id: `resolve_${role}`,
      summary: `Merge and validate ${role} media`,
      stageId: `${workflowId}.resolve-${role}`,
      inputExpr: `({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.${role} })`,
    })
  const primaryStage = stageNode({
    id: `stage_${primary}`,
    summary: `Stage ${primary} media`,
    stageId: `${workflowId}.stage-${primary}`,
    inputExpr: `({ generation: results.resolve_${primary}.output.generation, components: { ${primary}: results.resolve_${primary}.output.component } })`,
  })
  const secondaryStage = stageNode({
    id: `stage_${secondary}`,
    summary: `Stage ${secondary} media`,
    stageId: `${workflowId}.stage-${secondary}`,
    inputExpr: `({ generation: results.resolve_${secondary}.output.generation, components: { ${secondary}: results.resolve_${secondary}.output.component } })`,
  })
  const audioStage = stageNode({
    id: "stage_audio",
    summary: "Stage optional soundtrack",
    stageId: `${workflowId}.stage-audio`,
    inputExpr:
      "({ generation: results.resolve_audio.output.generation, components: { audio: results.resolve_audio.output.component } })",
  })
  const resolveAudio = stageNode({
    id: "resolve_audio",
    summary: "Merge and validate optional soundtrack",
    stageId: `${workflowId}.resolve-audio`,
    inputExpr:
      "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.audio })",
  })
  const resolveCaption = stageNode({
    id: "resolve_caption",
    summary: "Normalize captions consumed by the renderer",
    stageId: `${workflowId}.resolve-caption`,
    inputExpr:
      format === "react_reveal"
        ? "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: { hookCaption: flow_input.hook_caption, payoffCaption: flow_input.payoff_caption } })"
        : "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: { caption: flow_input.caption, textPlacement: flow_input.text_placement } })",
  })
  const resolveOutput = stageNode({
    id: "resolve_output",
    summary: "Normalize metadata consumed by draft finalization",
    stageId: `${workflowId}.resolve-output`,
    inputExpr:
      "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.output })",
  })
  const renderInputs = `              - id: resolve_and_stage_render_inputs
                summary: "Resolve and stage inputs first consumed by the renderer"
                value:
                  type: branchall
                  parallel: true
                  branches:
                    - summary: ${yamlString(`${primary} media`)}
                      modules:
${indent(resolveRole(primary), 22)}
${indent(primaryStage, 22)}
                    - summary: ${yamlString(`${secondary} media`)}
                      modules:
${indent(resolveRole(secondary), 22)}
${indent(secondaryStage, 22)}
                    - summary: "Optional soundtrack"
                      modules:
${indent(resolveAudio, 22)}
${indent(audioStage, 22)}
                    - summary: "Format captions"
                      modules:
${indent(resolveCaption, 22)}`
  const build = stageNode({
    id: "build_render_command",
    summary:
      format === "react_reveal"
        ? "Join full anticipation, full reveal, audio, and captions"
        : "Join chroma-keyed meme, background, audio, and caption",
    stageId: `${workflowId}.build-render-command`,
    inputExpr: `({ generation: results.load_template_defaults.output.generation, components: { ${primary}: results.resolve_and_stage_render_inputs[0].output.components.${primary}, ${secondary}: results.resolve_and_stage_render_inputs[1].output.components.${secondary}, audio: results.resolve_and_stage_render_inputs[2].output.components.audio, ...results.resolve_and_stage_render_inputs[3].output.component }, stagedMedia: { ${primary}: results.resolve_and_stage_render_inputs[0].output.stagedMedia.${primary}, ${secondary}: results.resolve_and_stage_render_inputs[1].output.stagedMedia.${secondary}, audio: results.resolve_and_stage_render_inputs[2].output.stagedMedia?.audio } })`,
  })
  const render = stageNode({
    id: "render_store_output",
    summary: "Render and store video artifacts",
    stageId: `${workflowId}.render-store-output`,
    inputExpr: "results.build_render_command.output",
  })
  const renderAndOutput = `    - id: render_and_output_metadata
      summary: "Render media while draft metadata is normalized"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Format render path"
            modules:
${renderInputs}
${indent(build, 14)}
${indent(render, 14)}
          - summary: "Draft output metadata"
            modules:
${indent(resolveOutput, 14)}`
  const finalize = stageNode({
    id: "finalize_output",
    summary: "Create draft video output",
    stageId: `${workflowId}.finalize-output`,
    inputExpr:
      "({ ...results.render_and_output_metadata[0].output, components: { ...results.render_and_output_metadata[0].output.components, ...results.render_and_output_metadata[1].output.component } })",
  })
  const discard = stageNode({
    id: "discard_staged_media",
    summary: "Discard temporary source media",
    stageId: `${workflowId}.discard-staged-media`,
    inputExpr: "results.finalize_output.output",
  })
  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${loadTemplate}
${renderAndOutput}
${finalize}
${discard}
schema:
${fixedVideoSchema(format)}
`
}

function fixedVideoSchema(format: "react_reveal" | "greenscreen_meme") {
  const media =
    format === "react_reveal"
      ? `    anticipation:
      type: object
      title: Anticipation clip
      properties:
        url: { type: string, title: Full clip URL }
      required: [url]
    reveal:
      type: object
      title: Reveal clip
      properties:
        url: { type: string, title: Full clip URL }
      required: [url]
    hook_caption: { type: string, title: Hook caption }
    payoff_caption: { type: string, title: Payoff caption }`
      : `    meme:
      type: object
      title: Greenscreen meme clip
      properties:
        url: { type: string, title: Full clip URL }
      required: [url]
    background:
      type: object
      title: Background image
      properties:
        url: { type: string, title: Image URL }
      required: [url]
    caption: { type: string, title: Hook caption }
    text_placement:
      type: string
      title: Caption placement
      enum: [top, middle, bottom]
      default: top`
  return `  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    template_id:
      type: object
      format: dynselect-template_id
      title: Template (optional)
${media}
    audio:
      type: object
      title: Soundtrack (optional)
      properties:
        url: { type: string, title: Audio URL }
    output:
      type: object
      title: Draft output
      properties:
        title: { type: string }
        description: { type: string, format: textarea }
        hashtags:
          type: array
          items: { type: string }
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(dynamicTemplateSelectCode("video").replaceAll("automation_id", "template_id"))}`
}

function ugcComponentFlowYaml(summary: string, description: string) {
  const loadTemplate = ugcRawStageModule({
    id: "load_template_defaults",
    summary: "Load and validate optional UGC template defaults",
    stageId: "ugc-video-generation.load-template-defaults",
    source: pipelineStageModule,
    inputExpr:
      "({ templateId: flow_input.template_id, generationId: flow_input.generation_id, scheduledFor: flow_input.scheduled_for })",
  })
  const resolver = (role: string, inputExpr: string) =>
    stageNode({
      id: `resolve_${role}_component`,
      summary: `Merge and validate ${role} component`,
      stageId: `ugc-video-generation.resolve-${role}-component`,
      inputExpr,
    })
  const component = (input: {
    id: string
    summary: string
    stageId: string
    checkpoint: string
    inputExpr: string
    indent?: number
  }) =>
    ugcRawStageModule({
      ...input,
      source: ugcComponentModuleSource(),
      component: true,
    })

  const analyze = component({
    id: "analyze_product",
    summary: "Product component — analyze facts",
    stageId: "ugc-video-generation.analyze-product",
    checkpoint: "analysis",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ product: results.resolve_product_component.output.component })",
      "{}"
    ),
  })
  const script = component({
    id: "generate_script_plan",
    summary: "Script component — hook, body, CTA and timing",
    stageId: "ugc-video-generation.generate-script-plan",
    checkpoint: "script",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ product: results.prepare_script_inputs[0].output.components.product, script: results.prepare_script_inputs[1].output.component })",
      "{ analysis: results.prepare_script_inputs[0].output.artifact }"
    ),
  })
  const actor = component({
    id: "resolve_actor",
    summary: "Actor component — resolve or generate portrait",
    stageId: "ugc-video-generation.resolve-generate-actor",
    checkpoint: "actor",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ actor: results.resolve_actor_component.output.component })",
      "{ analysis: results.prepare_script_inputs[0].output.artifact, script: results.generate_script_plan.output.artifact }"
    ),
  })
  const motion = component({
    id: "animate_actor",
    summary: "Actor component — animate portrait",
    stageId: "ugc-video-generation.animate-actor",
    checkpoint: "motion",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "results.resolve_actor.output.components",
      "{ actor: results.resolve_actor.output.artifact }"
    ),
  })
  const voice = component({
    id: "synthesize_voice",
    summary: "Voice component — speech and word timings",
    stageId: "ugc-video-generation.synthesize-voice",
    checkpoint: "voice",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ voice: results.resolve_voice_component.output.component })",
      "{ script: results.generate_script_plan.output.artifact }"
    ),
  })
  const broll = component({
    id: "generate_broll",
    summary: "B-roll component — timed visual inserts",
    stageId: "ugc-video-generation.generate-broll",
    checkpoint: "broll",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ broll: results.resolve_broll_component.output.component })",
      "{ script: results.generate_script_plan.output.artifact }"
    ),
  })
  const lipsync = component({
    id: "lip_sync_performance",
    summary: "Performance join — actor motion plus voice",
    stageId: "ugc-video-generation.lip-sync-performance",
    checkpoint: "lipsync",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ ...results.prepare_actor_voice[0].output.components, ...results.prepare_actor_voice[1].output.components })",
      "{ motion: results.prepare_actor_voice[0].output.artifact, voice: results.prepare_actor_voice[1].output.artifact }"
    ),
  })
  const composite = component({
    id: "composite_output",
    summary: "Render join — performance, B-roll and styling",
    stageId: "ugc-video-generation.composite-output",
    checkpoint: "composite",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "({ render: results.prepare_render_artifacts[2].output.component })",
      "{ script: results.generate_script_plan.output.artifact, voice: results.prepare_render_artifacts[0].output.performance.voice, lipsync: results.prepare_render_artifacts[0].output.performance.lipsync, broll: results.prepare_render_artifacts[1].output.artifact }"
    ),
  })
  const store = component({
    id: "store_final_output",
    summary: "Output component — persist draft video",
    stageId: "ugc-video-generation.store-final-output",
    checkpoint: "store",
    inputExpr: ugcComponentInputExpr(
      "results.load_template_defaults.output.generation",
      "results.composite_output.output.components",
      "{ script: results.generate_script_plan.output.artifact, composite: results.composite_output.output.artifact }"
    ),
  })

  const prepareScriptInputs = `    - id: prepare_script_inputs
      summary: "Resolve product facts while script configuration is validated"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Product resolution and analysis"
            modules:
${indent(resolver("product", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.product })"), 14)}
${indent(analyze, 14)}
          - summary: "Script configuration"
            modules:
${indent(resolver("script", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.script })"), 14)}`

  const prepareActorVoice = `              - id: prepare_actor_voice
                summary: "Prepare actor motion and voice for their lip-sync join"
                value:
                  type: branchall
                  parallel: true
                  branches:
                    - summary: "Actor and motion"
                      modules:
${indent(resolver("actor", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.actor })"), 22)}
${indent(actor, 22)}
${indent(motion, 22)}
                    - summary: "Voice track"
                      modules:
${indent(resolver("voice", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.voice })"), 22)}
${indent(voice, 22)}`
  const assemblePerformance = stageNode({
    id: "assemble_performance",
    summary: "Assemble isolated voice and lip-sync artifacts",
    stageId: "ugc-video-generation.assemble-performance",
    inputExpr:
      "({ voice: results.prepare_actor_voice[1].output.artifact, lipsync: results.lip_sync_performance.output.artifact })",
  })
  const renderArtifacts = `    - id: prepare_render_artifacts
      summary: "Prepare performance, B-roll, and render configuration for composite"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Actor, voice, and lip-sync performance"
            modules:
${prepareActorVoice}
${indent(lipsync, 14)}
${indent(assemblePerformance, 14)}
          - summary: "B-roll inserts"
            modules:
${indent(resolver("broll", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.broll })"), 14)}
${indent(broll, 14)}
          - summary: "Render configuration"
            modules:
${indent(resolver("render", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: flow_input.render })"), 14)}`

  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${loadTemplate}
${prepareScriptInputs}
${script}
${renderArtifacts}
${composite}
${store}
schema:
${ugcComponentSchema()}
`
}

function ugcComponentInputExpr(
  generation: string,
  components: string,
  checkpoints: string
) {
  return `({ componentExecution: true, generation: ${generation}, ...${generation}, components: ${components}, checkpoints: ${checkpoints} })`
}

function ugcRawStageModule(input: {
  id: string
  summary: string
  stageId: string
  source: string
  inputExpr: string
  component?: boolean
  checkpoint?: string
}) {
  return `    - id: ${input.id}
      summary: ${yamlString(input.summary)}
      timeout:
        type: static
        value: ${input.component ? 1800 : 300}
      value:
        type: rawscript
        language: bun
        content: ${yamlString(input.source)}
        input_transforms:
          base_url:
            type: static
            value: $var:f/lumenclip/internal_base_url
          shared_secret:
            type: static
            value: $var:f/lumenclip/shared_secret
          default_owner_id:
            type: static
            value: $var:f/lumenclip/default_owner_id
          stage_id:
            type: static
            value: ${yamlString(input.stageId)}
${
  input.component
    ? `          checkpoint_name:
            type: static
            value: ${yamlString(input.checkpoint ?? "")}
          max_wait_seconds:
            type: static
            value: 1500
`
    : ""
}          owner_id:
            type: javascript
            expr: flow_input.owner_id
          request_id:
            type: javascript
            expr: flow_input.request_id
          stage_input:
            type: javascript
            expr: ${yamlString(input.inputExpr)}`
}

function ugcComponentModuleSource() {
  return `type PipelineStageExecution = {
  stage: { id: string; workflowId: string }
  requestId: string
  status: "succeeded" | "running"
  externalCalls: number
  output: Record<string, unknown>
  operation?: { id?: string; status?: string }
  providerRequests?: Array<Record<string, unknown>>
}

export async function main(
  base_url: string,
  shared_secret: string,
  default_owner_id: string,
  stage_id: string,
  checkpoint_name: string,
  stage_input: Record<string, unknown>,
  max_wait_seconds = 1500,
  owner_id?: string,
  request_id?: string
): Promise<PipelineStageExecution> {
  const ownerId = owner_id?.trim() || required("default_owner_id", default_owner_id)
  const requestId = request_id?.trim() || process.env.WM_ROOT_FLOW_JOB_ID?.trim() || process.env.WM_FLOW_JOB_ID?.trim() || process.env.WM_JOB_ID?.trim() || \`windmill-\${crypto.randomUUID()}\`
  const generation = record(stage_input.generation)
  const baseGenerationId = text(generation.generationId) || requestId
  const isolatedInput = {
    ...stage_input,
    generationId: \`\${baseGenerationId}-\${checkpoint_name}\`,
    scheduledFor: generation.scheduledFor,
  }
  const queued = await callStage(base_url, shared_secret, ownerId, requestId, stage_id, isolatedInput)
  if (queued.status === "succeeded") {
    return {
      ...queued,
      output: {
        ...queued.output,
        generation,
        components: record(stage_input.components),
      },
    }
  }
  const jobId = text(queued.operation?.id)
  if (!jobId) throw new Error(\`\${checkpoint_name} did not return a queue job\`)
  const deadline = Date.now() + Math.max(30, max_wait_seconds) * 1000
  while (Date.now() < deadline) {
    await Bun.sleep(2000)
    const polled = await callStage(
      base_url,
      shared_secret,
      ownerId,
      requestId,
      "ugc-video-generation.get-checkpoint-job",
      { jobId }
    )
    const job = record(polled.output.job)
    const status = text(job.status)
    if (["failed", "dead", "canceled"].includes(status)) {
      throw new Error(text(job.error) || \`\${checkpoint_name} component failed\`)
    }
    if (status !== "completed") continue
    const result = record(job.result)
    if (result.skipped === true) {
      throw new Error(\`\${checkpoint_name} component was skipped: \${text(result.reason) || "unknown reason"}\`)
    }
    const artifact = record(record(result.checkpoints)[checkpoint_name])
    if (!Object.keys(artifact).length) {
      throw new Error(\`\${checkpoint_name} completed without a checkpoint artifact\`)
    }
    return {
      stage: queued.stage,
      requestId,
      status: "succeeded",
      externalCalls: queued.externalCalls + polled.externalCalls,
      ...(Array.isArray(artifact.providerRequests) ? { providerRequests: artifact.providerRequests } : {}),
      output: {
        component: checkpoint_name,
        artifact,
        generation,
        components: record(stage_input.components),
        operation: { id: jobId, status: "succeeded" },
      },
    }
  }
  throw new Error(\`\${checkpoint_name} component timed out after \${max_wait_seconds}s\`)
}

async function callStage(
  baseUrl: string,
  secret: string,
  ownerId: string,
  requestId: string,
  stageId: string,
  input: Record<string, unknown>
) {
  const response = await fetch(
    \`\${required("base_url", baseUrl).replace(/\\\/$/, "")}/api/internal/windmill/stages/\${encodeURIComponent(stageId)}\`,
    {
      method: "POST",
      headers: {
        authorization: \`Bearer \${required("shared_secret", secret)}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ownerId, requestId, input }),
    }
  )
  const payload = (await response.json().catch(() => null)) as { execution?: PipelineStageExecution; error?: string; providerRequests?: Array<Record<string, unknown>> } | null
  if (!response.ok || !payload?.execution) {
    const providerRequests = payload?.providerRequests?.length
      ? \`\nProvider requests:\n\${JSON.stringify(payload.providerRequests, null, 2)}\`
      : ""
    throw new Error((payload?.error || \`Lumenclip stage request failed with \${response.status}\`) + providerRequests)
  }
  return payload.execution
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
function required(name: string, value: unknown) {
  const result = text(value)
  if (!result) throw new Error(\`Lumenclip \${name} is not configured\`)
  return result
}`
}

function ugcComponentSchema() {
  return `  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  order:
    - template_id
    - product
    - script
    - actor
    - voice
    - broll
    - render
  properties:
    template_id:
      type: object
      format: dynselect-template_id
      title: Template (optional)
      description: Load defaults from a UGC template; every component below can override it.
    product:
      type: object
      title: Product
      additionalProperties: false
      properties:
        url:
          type: string
          title: Product URL
        brief:
          type: string
          title: Product brief
          format: textarea
        analysis:
          type: object
          title: Supplied analysis
          description: Optional structured artifact that skips product analysis.
    script:
      type: object
      title: Script
      additionalProperties: false
      properties:
        targetDurationSeconds:
          type: integer
          title: Target duration (seconds)
          minimum: 15
          maximum: 180
          default: 60
        plan:
          type: object
          title: Supplied script plan
          description: Optional hook, segments, caption and hashtags artifact that skips script generation.
    actor:
      type: object
      title: Actor
      additionalProperties: false
      properties:
        source:
          type: string
          title: Source
          enum: [generate, asset]
          default: generate
        assetUrl:
          type: string
          title: Portrait asset URL
        prompt:
          type: string
          title: Portrait prompt
          format: textarea
        motionPrompt:
          type: string
          title: Motion prompt
          format: textarea
    voice:
      type: object
      title: Voice
      additionalProperties: false
      properties:
        voiceId:
          type: string
          title: ElevenLabs voice ID
        model:
          type: string
          title: Voice model
          default: eleven_multilingual_v2
    broll:
      type: object
      title: B-roll
      additionalProperties: false
      properties:
        enabled:
          type: boolean
          title: Generate B-roll
          default: true
        count:
          type: integer
          title: Images
          minimum: 0
          maximum: 6
          default: 3
    render:
      type: object
      title: Render
      additionalProperties: false
      properties:
        aspectRatio:
          type: string
          title: Aspect ratio
          enum: ["9:16", "1:1", "16:9"]
          default: "9:16"
        lipSyncTier:
          type: string
          title: Lip-sync tier
          enum: [standard, premium]
          default: standard
        captions:
          type: object
          title: Captions
        hookOverlay:
          type: object
          title: Hook overlay
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(dynamicTemplateSelectCode("ugc").replaceAll("automation_id", "template_id"))}`
}

function indent(value: string, spaces: number) {
  const prefix = " ".repeat(spaces)
  return value
    .split("\n")
    .map((line) => `${prefix}${line.startsWith("    ") ? line.slice(4) : line}`)
    .join("\n")
}

function yamlString(value: string) {
  return JSON.stringify(value)
}
