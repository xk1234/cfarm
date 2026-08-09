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
  } | null
  if (!response.ok || !payload?.execution) {
    throw new Error(payload?.error || \`Lumenclip stage request failed with \${response.status}\`)
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

function artifactNode(id: string, summary: string, inputExpr: string) {
  return `    - id: ${id}
      summary: ${yamlString(summary)}
      value:
        type: rawscript
        language: bun
        content: ${yamlString(`export async function main(artifact: Record<string, unknown>) { return { output: { artifact } } }`)}
        input_transforms:
          artifact:
            type: javascript
            expr: ${yamlString(inputExpr)}`
}

function slideshowDagFlowYaml(summary: string, description: string) {
  const hydrate = `    - id: hydrate_inputs
      summary: "Hydrate independent slideshow inputs"
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
          - summary: "Usage memory"
            modules:
${indent(stageNode({ id: "load_usage", summary: "Load usage history", stageId: "slideshow-generation.list-usage-history", inputExpr: "({})" }), 14)}
          - summary: "Prior generation history"
            modules:
${indent(stageNode({ id: "load_prior_runs", summary: "Load prior runs", stageId: "slideshow-generation.list-prior-runs", inputExpr: "({ automationId: flow_input.automation_id })" }), 14)}
          - summary: "Generation model settings"
            modules:
${indent(stageNode({ id: "load_model_settings", summary: "Load model settings", stageId: "slideshow-generation.load-model-settings", inputExpr: "({})" }), 14)}`
  const validate = stageNode({
    id: "validate_input",
    summary: "Join hydrated inputs and validate",
    stageId: "slideshow-generation.validate-input",
    inputExpr:
      "({ automationId: flow_input.automation_id, automationRecord: results.hydrate_inputs[0].output.automationRecord, collections: results.hydrate_inputs[1].output.collections, wordCollections: results.hydrate_inputs[2].output.wordCollections, usageHistory: results.hydrate_inputs[3].output.usageHistory, priorRuns: results.hydrate_inputs[4].output.priorRuns, generationSettings: results.hydrate_inputs[5].output.generationSettings })",
  })
  const count = stageNode({
    id: "resolve_slide_count",
    summary: "Resolve slide count",
    stageId: "slideshow-generation.resolve-slide-count",
    inputExpr: "results.validate_input.output",
  })
  const hook = stageNode({
    id: "select_expand_hook",
    summary: "Select and expand hook",
    stageId: "slideshow-generation.select-expand-hook",
    inputExpr: "results.resolve_slide_count.output",
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
  const textArtifact = artifactNode(
    "text_artifact",
    "Text path — accepted slide copy",
    "results.retry_text_similarity.output"
  )
  const concepts = stageNode({
    id: "derive_visual_concepts",
    summary: "Visual path — derive concepts",
    stageId: "slideshow-generation.derive-visual-concepts",
    inputExpr: "results.retry_text_similarity.output",
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
  const split = `    - id: prepare_slide_artifacts
      summary: "Prepare text and visual artifacts"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Accepted text artifact"
            modules:
${indent(textArtifact, 14)}
          - summary: "Visual concepts and image selection"
            modules:
${indent(concepts, 14)}
${indent(shortlists, 14)}
${indent(images, 14)}`
  const assemble = stageNode({
    id: "assemble_plan",
    summary: "Join text and images into slide plan",
    stageId: "slideshow-generation.assemble-plan",
    inputExpr:
      "({ ...results.prepare_slide_artifacts[0].output.artifact, visualConceptsBySlide: results.prepare_slide_artifacts[1].output.visualConceptsBySlide, shortlists: results.prepare_slide_artifacts[1].output.shortlists, selectedImages: results.prepare_slide_artifacts[1].output.selectedImages })",
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
  const qa = stageNode({
    id: "validate_output",
    summary: "Validate generated output",
    stageId: "slideshow-generation.validate-output",
    inputExpr: "results.render_store_mp4.output",
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
${hydrate}
${validate}
${count}
${hook}
${research}
${prompt}
${generate}
${retry}
${split}
${assemble}
${translate}
${png}
${mp4}
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
      summary: "Resolve independent LinkedIn input groups"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Audience and topic"
            modules:
${indent(artifactNode("audience_topic_input", "Audience and topic input", "({ niche: flow_input.niche, topic: flow_input.topic, excludedTopics: flow_input.excluded_topics })"), 14)}
          - summary: "Proof and evidence"
            modules:
${indent(artifactNode("proof_input", "Proof bank input", "({ proof: flow_input.proof ?? [] })"), 14)}
          - summary: "Voice and persona"
            modules:
${indent(artifactNode("voice_input", "Voice, persona and post model", '({ persona: flow_input.persona ?? "educator", model: flow_input.model })'), 14)}
          - summary: "Brief controls"
            modules:
${indent(artifactNode("brief_input", "Optional brief and strategy model", "({ brief: flow_input.brief, briefModel: flow_input.brief_model })"), 14)}
          - summary: "Batch controls"
            modules:
${indent(artifactNode("batch_input", "Batch count input", "({ count: flow_input.count ?? 1 })"), 14)}`
  const modules = [
    [
      "validate_input",
      "Join and normalize LinkedIn inputs",
      "validate-input",
      "({ ...results.resolve_input_groups[0].output.artifact, ...results.resolve_input_groups[1].output.artifact, ...results.resolve_input_groups[2].output.artifact, ...results.resolve_input_groups[3].output.artifact, ...results.resolve_input_groups[4].output.artifact })",
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
      summary: "Resolve independent X and Threads input groups"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Saved template reference"
            modules:
${indent(artifactNode("template_input", "Saved social template reference", "({ automationId: flow_input.automation_id })"), 14)}
          - summary: "Per-run content input"
            modules:
${indent(artifactNode("content_input", "Topic and source candidate", "({ topic: flow_input.topic, sourceCandidate: flow_input.source_candidate })"), 14)}`
  const sequential = [
    [
      "validate_input",
      "Join template and per-run content",
      "validate-input",
      "({ ...results.resolve_input_groups[0].output.artifact, ...results.resolve_input_groups[1].output.artifact, deriveBrief: true })",
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
  const captionArtifact =
    format === "react_reveal"
      ? "({ hookCaption: flow_input.hook_caption, payoffCaption: flow_input.payoff_caption })"
      : "({ caption: flow_input.caption, textPlacement: flow_input.text_placement })"
  const inputGroups = `    - id: resolve_input_groups
      summary: "Resolve independent format input groups"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Template reference"
            modules:
${indent(artifactNode("template_input", "Template defaults reference", "({ templateId: flow_input.template_id })"), 14)}
          - summary: ${yamlString(`${primary} input`)}
            modules:
${indent(artifactNode(`${primary}_input`, `${primary} media component`, `flow_input.${primary} ?? {}`), 14)}
          - summary: ${yamlString(`${secondary} input`)}
            modules:
${indent(artifactNode(`${secondary}_input`, `${secondary} media component`, `flow_input.${secondary} ?? {}`), 14)}
          - summary: "Audio input"
            modules:
${indent(artifactNode("audio_input", "Optional soundtrack component", "flow_input.audio ?? {}"), 14)}
          - summary: "Caption input"
            modules:
${indent(artifactNode("caption_input", "Format caption component", captionArtifact), 14)}
          - summary: "Draft output input"
            modules:
${indent(artifactNode("output_input", "Draft metadata component", "flow_input.output ?? {}"), 14)}`
  const resolve = stageNode({
    id: "resolve_components",
    summary: "Resolve template and format components",
    stageId: `${workflowId}.resolve-components`,
    inputExpr:
      format === "react_reveal"
        ? "({ templateId: results.resolve_input_groups[0].output.artifact.templateId, anticipation: results.resolve_input_groups[1].output.artifact, reveal: results.resolve_input_groups[2].output.artifact, audio: results.resolve_input_groups[3].output.artifact, hookCaption: results.resolve_input_groups[4].output.artifact.hookCaption, payoffCaption: results.resolve_input_groups[4].output.artifact.payoffCaption, output: results.resolve_input_groups[5].output.artifact })"
        : "({ templateId: results.resolve_input_groups[0].output.artifact.templateId, meme: results.resolve_input_groups[1].output.artifact, background: results.resolve_input_groups[2].output.artifact, audio: results.resolve_input_groups[3].output.artifact, caption: results.resolve_input_groups[4].output.artifact.caption, textPlacement: results.resolve_input_groups[4].output.artifact.textPlacement, output: results.resolve_input_groups[5].output.artifact })",
  })
  const primaryStage = stageNode({
    id: `stage_${primary}`,
    summary: `Stage ${primary} media`,
    stageId: `${workflowId}.stage-${primary}`,
    inputExpr: "results.resolve_components.output",
  })
  const secondaryStage = stageNode({
    id: `stage_${secondary}`,
    summary: `Stage ${secondary} media`,
    stageId: `${workflowId}.stage-${secondary}`,
    inputExpr: "results.resolve_components.output",
  })
  const audioStage = stageNode({
    id: "stage_audio",
    summary: "Stage optional soundtrack",
    stageId: `${workflowId}.stage-audio`,
    inputExpr: "results.resolve_components.output",
  })
  const branch = `    - id: stage_media_components
      summary: "Stage independent media components"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: ${yamlString(`${primary} component`)}
            modules:
${indent(primaryStage, 14)}
          - summary: ${yamlString(`${secondary} component`)}
            modules:
${indent(secondaryStage, 14)}
          - summary: "Optional audio component"
            modules:
${indent(audioStage, 14)}`
  const build = stageNode({
    id: "build_render_command",
    summary:
      format === "react_reveal"
        ? "Join full anticipation and full reveal"
        : "Join chroma-keyed meme, background and caption",
    stageId: `${workflowId}.build-render-command`,
    inputExpr: `({ ...results.resolve_components.output, stagedMedia: { ${primary}: results.stage_media_components[0].output.stagedMedia.${primary}, ${secondary}: results.stage_media_components[1].output.stagedMedia.${secondary}, audio: results.stage_media_components[2].output.stagedMedia?.audio } })`,
  })
  const render = stageNode({
    id: "render_store_output",
    summary: "Render and store video artifacts",
    stageId: `${workflowId}.render-store-output`,
    inputExpr: "results.build_render_command.output",
  })
  const finalize = stageNode({
    id: "finalize_output",
    summary: "Create draft video output",
    stageId: `${workflowId}.finalize-output`,
    inputExpr: "results.render_store_output.output",
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
${inputGroups}
${resolve}
${branch}
${build}
${render}
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
  const inputGroups = `    - id: resolve_input_groups
      summary: "Resolve independent UGC input groups"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Template reference"
            modules:
${indent(artifactNode("template_input", "Template defaults reference", "({ templateId: flow_input.template_id })"), 14)}
          - summary: "Product input"
            modules:
${indent(artifactNode("product_input", "Product component input", "flow_input.product ?? {}"), 14)}
          - summary: "Script input"
            modules:
${indent(artifactNode("script_input", "Script component input", "flow_input.script ?? {}"), 14)}
          - summary: "Actor input"
            modules:
${indent(artifactNode("actor_input", "Actor component input", "flow_input.actor ?? {}"), 14)}
          - summary: "Voice input"
            modules:
${indent(artifactNode("voice_input", "Voice component input", "flow_input.voice ?? {}"), 14)}
          - summary: "B-roll input"
            modules:
${indent(artifactNode("broll_input", "B-roll component input", "flow_input.broll ?? {}"), 14)}
          - summary: "Render input"
            modules:
${indent(artifactNode("render_input", "Render component input", "flow_input.render ?? {}"), 14)}`
  const resolveModule = ugcRawStageModule({
    id: "resolve_components",
    summary: "Resolve template and component overrides",
    stageId: "ugc-video-generation.resolve-components",
    source: pipelineStageModule,
    inputExpr:
      "({ templateId: results.resolve_input_groups[0].output.artifact.templateId, product: results.resolve_input_groups[1].output.artifact, script: results.resolve_input_groups[2].output.artifact, actor: results.resolve_input_groups[3].output.artifact, voice: results.resolve_input_groups[4].output.artifact, broll: results.resolve_input_groups[5].output.artifact, render: results.resolve_input_groups[6].output.artifact, generationId: flow_input.generation_id, scheduledFor: flow_input.scheduled_for })",
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
    inputExpr: ugcComponentInputExpr("{}"),
  })
  const script = component({
    id: "generate_script_plan",
    summary: "Script component — hook, body, CTA and timing",
    stageId: "ugc-video-generation.generate-script-plan",
    checkpoint: "script",
    inputExpr: ugcComponentInputExpr(
      "{ analysis: results.analyze_product.output.artifact }"
    ),
  })
  const actor = component({
    id: "resolve_actor",
    summary: "Actor component — resolve or generate portrait",
    stageId: "ugc-video-generation.resolve-generate-actor",
    checkpoint: "actor",
    inputExpr: ugcComponentInputExpr(
      "{ analysis: results.analyze_product.output.artifact, script: results.generate_script_plan.output.artifact }"
    ),
  })
  const motion = component({
    id: "animate_actor",
    summary: "Actor component — animate portrait",
    stageId: "ugc-video-generation.animate-actor",
    checkpoint: "motion",
    inputExpr: ugcComponentInputExpr(
      "{ actor: results.resolve_actor.output.artifact }"
    ),
  })
  const voice = component({
    id: "synthesize_voice",
    summary: "Voice component — speech and word timings",
    stageId: "ugc-video-generation.synthesize-voice",
    checkpoint: "voice",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact }"
    ),
  })
  const broll = component({
    id: "generate_broll",
    summary: "B-roll component — timed visual inserts",
    stageId: "ugc-video-generation.generate-broll",
    checkpoint: "broll",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact }"
    ),
  })
  const lipsync = component({
    id: "lip_sync_performance",
    summary: "Performance join — actor motion plus voice",
    stageId: "ugc-video-generation.lip-sync-performance",
    checkpoint: "lipsync",
    inputExpr: ugcComponentInputExpr(
      "{ motion: results.prepare_media_components[0].output.artifact, voice: results.prepare_media_components[1].output.artifact }"
    ),
  })
  const composite = component({
    id: "composite_output",
    summary: "Render join — performance, B-roll and styling",
    stageId: "ugc-video-generation.composite-output",
    checkpoint: "composite",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact, voice: results.prepare_media_components[1].output.artifact, lipsync: results.lip_sync_performance.output.artifact, broll: results.prepare_media_components[2].output.artifact }"
    ),
  })
  const store = component({
    id: "store_final_output",
    summary: "Output component — persist draft video",
    stageId: "ugc-video-generation.store-final-output",
    checkpoint: "store",
    inputExpr: ugcComponentInputExpr(
      "{ script: results.generate_script_plan.output.artifact, composite: results.composite_output.output.artifact }"
    ),
  })

  const branch = `    - id: prepare_media_components
      summary: "Prepare independent media components"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Actor portrait and motion"
            modules:
${indent(actor, 14)}
${indent(motion, 14)}
          - summary: "Voice track"
            modules:
${indent(voice, 14)}
          - summary: "B-roll inserts"
            modules:
${indent(broll, 14)}`

  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${inputGroups}
${resolveModule}
${analyze}
${script}
${branch}
${lipsync}
${composite}
${store}
schema:
${ugcComponentSchema()}
`
}

function ugcComponentInputExpr(checkpoints: string) {
  return `({ componentExecution: true, generation: results.resolve_components.output.generation, ...results.resolve_components.output.generation, components: results.resolve_components.output.components, checkpoints: ${checkpoints} })`
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
  const queued = await callStage(base_url, shared_secret, ownerId, requestId, stage_id, stage_input)
  if (queued.status === "succeeded") return queued
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
      output: {
        component: checkpoint_name,
        artifact,
        generation: record(stage_input.generation),
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
  const payload = (await response.json().catch(() => null)) as { execution?: PipelineStageExecution; error?: string } | null
  if (!response.ok || !payload?.execution) {
    throw new Error(payload?.error || \`Lumenclip stage request failed with \${response.status}\`)
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
