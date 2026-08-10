import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { PipelineWorkflowId } from "../lib/pipeline-stages"
import { buildNativeWindmillRuntime } from "./build-native-runtime.mts"

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
    id: "template-video-generation",
    folder: "template_video_generation__flow",
    summary: "lumenclip - template video generation",
    description:
      "Generate every non-UGC video template through independent copy and media paths that join at render assembly.",
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

await buildNativeWindmillRuntime()

for (const workflow of workflows) {
  const outputPath = path.join(
    import.meta.dirname,
    "f",
    "lumenclip",
    workflow.folder,
    "flow.yaml"
  )
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${workflowFlowYaml(workflow).trimEnd()}\n`)
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
    case "template-video-generation":
      return templateVideoDagFlowYaml(workflow.summary, workflow.description)
    case "linkedin-generation":
      return linkedinDagFlowYaml(workflow.summary, workflow.description)
    case "x-threads-generation":
      return xThreadsDagFlowYaml(workflow.summary, workflow.description)
  }
}

function linkedinInputSchema() {
  return `  order:
    - niche
    - topic
    - excluded_topics
    - proof
    - persona
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
    count:
      type: integer
      title: Posts
      minimum: 1
      maximum: 4
      default: 1
  required:
    - niche`
}

function stageNode(input: {
  id: string
  summary: string
  stageId: string
  inputExpr: string
}) {
  return ugcStageModule(input)
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
      "({ automationId: flow_input.automation_id, automationRecord: results.load_validation_inputs[0].output.automationRecord, collections: results.load_validation_inputs[1].output.collections, wordCollections: results.load_validation_inputs[2].output.wordCollections, hook: flow_input.hook })",
  })
  const modelSettings = stageNode({
    id: "load_model_settings",
    summary: "Load text generation model",
    stageId: "slideshow-generation.load-model-settings",
    inputExpr: "results.validate_input.output",
  })
  const count = stageNode({
    id: "apply_fixed_slide_count",
    summary: "Apply fixed slide count",
    stageId: "slideshow-generation.apply-fixed-slide-count",
    inputExpr:
      "({ ...results.load_model_settings.output, textModel: results.load_model_settings.output.generationSettings.slideshowTextModel })",
  })
  const hook = stageNode({
    id: "select_expand_hook",
    summary: "Select and expand hook",
    stageId: "slideshow-generation.select-expand-hook",
    inputExpr: "results.apply_fixed_slide_count.output",
  })
  const prompt = stageNode({
    id: "build_text_prompt",
    summary: "Build structured text prompt",
    stageId: "slideshow-generation.build-text-prompt",
    inputExpr: "results.select_expand_hook.output",
  })
  const generate = stageNode({
    id: "generate_slide_text",
    summary: "Generate slide text",
    stageId: "slideshow-generation.generate-slide-text",
    inputExpr: "results.build_text_prompt.output",
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
    inputExpr:
      "({ ...results.produce_text_and_candidates[0].output, candidatesBySlide: results.produce_text_and_candidates[1].output.candidatesBySlide })",
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
${indent(modelSettings, 14)}
${indent(count, 14)}
${indent(hook, 14)}
${indent(prompt, 14)}
${indent(generate, 14)}
          - summary: "Static image candidate preparation"
            modules:
${indent(candidatePools, 14)}`
  const assemble = stageNode({
    id: "assemble_plan",
    summary: "Join text and images into slide plan",
    stageId: "slideshow-generation.assemble-plan",
    inputExpr: "results.select_slide_images.output",
  })
  const png = stageNode({
    id: "render_store_pngs",
    summary: "Render and persist slide PNGs",
    stageId: "slideshow-generation.render-store-pngs",
    inputExpr: "results.assemble_plan.output",
  })
  const qa = stageNode({
    id: "validate_output",
    summary: "Validate generated output",
    stageId: "slideshow-generation.validate-output",
    inputExpr: "results.render_store_pngs.output",
  })
  const finalize = stageNode({
    id: "finalize_output",
    summary: "Persist run, output, and media",
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
${shortlists}
${images}
${assemble}
${png}
${qa}
${finalize}
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  x-lumenclip-hide-input-node: true
  properties:
    automation_id:
      type: string
      format: dynselect-automation_id
      title: Template
    hook:
      type: string
      format: dynselect-hook
      title: Hook override (optional)
      description: Choose one saved hook instead of letting the template rotate hooks automatically.
  required: [automation_id]
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(
    workflowDynamicSelectCode({
      templateFields: {
        automation_id: { table: "templates", automationKind: "slideshow" },
      },
      hookFields: { hook: { templateField: "automation_id" } },
    })
  )}
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
  x-lumenclip-hide-input-node: true
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
  x-lumenclip-hide-input-node: true
  properties:
    automation_id:
      type: string
      format: dynselect-automation_id
      title: Template
    topic:
      type: string
      title: Topic (optional)
    source_candidate:
      type: object
      title: Reaction source (optional)
      description: Add a source post only when the generated post should react to it.
      additionalProperties: false
      properties:
        source:
          type: string
          title: Platform
          enum: [x, tiktok, instagram]
          default: x
        url:
          type: string
          format: uri
          title: Source URL
        author:
          type: string
          title: Author (optional)
        text:
          type: string
          format: textarea
          title: Source text or transcript
  required: [automation_id]
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(
    workflowDynamicSelectCode({
      templateFields: {
        automation_id: {
          table: "social_templates",
          platforms: ["x", "threads"],
        },
      },
    })
  )}
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
      inputExpr: `({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: { collectionId: flow_input.${role}_collection_id } })`,
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
      "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: {} })",
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
      ? `    anticipation_collection_id:
      type: object
      format: dynselect-anticipation_collection_id
      title: Anticipation video collection
      description: Pick a collection; each run selects one full clip from it.
    reveal_collection_id:
      type: object
      format: dynselect-reveal_collection_id
      title: Reveal video collection
      description: Pick a collection; each run selects one full clip from it.
    hook_caption: { type: string, title: Hook caption }
    payoff_caption: { type: string, title: Payoff caption }`
      : `    meme_collection_id:
      type: object
      format: dynselect-meme_collection_id
      title: Greenscreen video collection
      description: Pick a collection; each run selects one full greenscreen clip from it.
    background_collection_id:
      type: object
      format: dynselect-background_collection_id
      title: Background photo collection
      description: Pick a collection; each run selects one background photo from it.
    caption: { type: string, title: Hook caption }
    text_placement:
      type: string
      title: Caption placement
      enum: [top, middle, bottom]
      default: top`
  return `  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  x-lumenclip-hide-input-node: true
  properties:
    template_id:
      type: string
      format: dynselect-template_id
      title: Template (optional)
${media}
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
  x-windmill-dyn-select-code: ${yamlString(
    workflowDynamicSelectCode({
      templateFields: {
        template_id: {
          table: "templates",
          automationKind: "video",
          videoFormat: format,
        },
      },
      mediaCollectionFields:
        format === "react_reveal"
          ? {
              anticipation_collection_id: "video",
              reveal_collection_id: "video",
            }
          : {
              meme_collection_id: "video",
              background_collection_id: "image",
            },
    })
  )}
`
}

function templateVideoDagFlowYaml(summary: string, description: string) {
  const load = stageNode({
    id: "load_template",
    summary: "Load and validate video template",
    stageId: "template-video-generation.load-template",
    inputExpr: "({ templateId: flow_input.template_id })",
  })
  const copy = stageNode({
    id: "generate_copy",
    summary: "Generate hook, captions, and post metadata",
    stageId: "template-video-generation.generate-copy",
    inputExpr: "results.load_template.output",
  })
  const media = stageNode({
    id: "resolve_media",
    summary: "Resolve configured media for every segment",
    stageId: "template-video-generation.resolve-media",
    inputExpr: "results.load_template.output",
  })
  const assemble = stageNode({
    id: "assemble_components",
    summary: "Join copy and media at renderer input",
    stageId: "template-video-generation.assemble-components",
    inputExpr:
      "({ generation: results.load_template.output.generation, template: results.load_template.output.template, copy: results.prepare_copy_and_media[0].output.copy, resolvedMedia: results.prepare_copy_and_media[1].output.resolvedMedia })",
  })
  const stageMedia = stageNode({
    id: "stage_media",
    summary: "Stage selected render media",
    stageId: "template-video-generation.stage-media",
    inputExpr: "results.assemble_components.output",
  })
  const build = stageNode({
    id: "build_render_command",
    summary: "Build template FFmpeg command",
    stageId: "template-video-generation.build-render-command",
    inputExpr: "results.stage_media.output",
  })
  const render = stageNode({
    id: "render_store_output",
    summary: "Render and store video artifacts",
    stageId: "template-video-generation.render-store-output",
    inputExpr: "results.build_render_command.output",
  })
  const finalize = stageNode({
    id: "finalize_output",
    summary: "Persist unpublished video output",
    stageId: "template-video-generation.finalize-output",
    inputExpr: "results.render_store_output.output",
  })
  const discard = stageNode({
    id: "discard_staged_media",
    summary: "Discard temporary source media",
    stageId: "template-video-generation.discard-staged-media",
    inputExpr: "results.finalize_output.output",
  })
  return `summary: ${yamlString(summary)}
description: ${yamlString(description)}
value:
  modules:
${load}
    - id: prepare_copy_and_media
      summary: "Prepare independent copy and media artifacts"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Copy generation"
            modules:
${indent(copy, 14)}
          - summary: "Media resolution"
            modules:
${indent(media, 14)}
${assemble}
${stageMedia}
${build}
${render}
${finalize}
${discard}
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  x-lumenclip-hide-input-node: true
  properties:
    template_id:
      type: string
      format: dynselect-template_id
      title: Video template
  required: [template_id]
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(
    workflowDynamicSelectCode({
      templateFields: {
        template_id: {
          table: "templates",
          automationKind: "video",
          excludedVideoFormats: ["ugc_ad", "react_reveal", "greenscreen_meme"],
        },
      },
    })
  )}
`
}

function ugcComponentFlowYaml(summary: string, description: string) {
  const loadTemplate = ugcStageModule({
    id: "load_template_defaults",
    summary: "Load and validate optional UGC template defaults",
    stageId: "ugc-video-generation.load-template-defaults",
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
    ugcStageModule({
      ...input,
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
${indent(resolver("actor", "({ generation: results.load_template_defaults.output.generation, templateDefaults: results.load_template_defaults.output.templateDefaults, override: { ...flow_input.actor, collectionId: flow_input.actor_collection_id } })"), 22)}
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

function ugcStageModule(input: {
  id: string
  summary: string
  stageId: string
  stageIdExpr?: string
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
        type: script
        path: f/lumenclip/workflow_stage_runtime
        input_transforms:
          runtime_env_json:
            type: static
            value: $var:f/lumenclip/runtime_env_json
          default_owner_id:
            type: static
            value: $var:f/lumenclip/default_owner_id
          stage_id:
            type: ${input.stageIdExpr ? "javascript" : "static"}
            ${input.stageIdExpr ? `expr: ${input.stageIdExpr}` : `value: ${yamlString(input.stageId)}`}
${
  input.component
    ? `          checkpoint_name:
            type: static
            value: ${yamlString(input.checkpoint ?? "")}
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

function ugcComponentSchema() {
  return `  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  x-lumenclip-hide-input-node: true
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
      type: string
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
    actor:
      type: object
      title: Actor
      additionalProperties: false
      properties:
        source:
          type: string
          title: Source
          enum: [generate, collection]
          default: generate
        prompt:
          type: string
          title: Portrait prompt
          format: textarea
        motionPrompt:
          type: string
          title: Motion prompt
          format: textarea
    actor_collection_id:
      type: object
      format: dynselect-actor_collection_id
      title: Actor portrait collection
      description: Used when Actor source is collection; each run selects one portrait from this photo collection.
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
          additionalProperties: false
          properties:
            enabled:
              type: boolean
              title: Show captions
              default: true
            style:
              type: string
              title: Caption style
              default: karaoke
            fallback:
              type: string
              title: Caption renderer
              enum: [drawtext, png_frames]
              default: drawtext
        hookOverlay:
          type: object
          title: Hook overlay
          additionalProperties: false
          properties:
            enabled:
              type: boolean
              title: Show hook overlay
              default: true
            durationMs:
              type: integer
              title: Duration (milliseconds)
              minimum: 500
              maximum: 10000
              default: 3000
            style:
              type: string
              title: Overlay style
              default: bold
  x-windmill-dyn-select-lang: bun
  x-windmill-dyn-select-code: ${yamlString(
    workflowDynamicSelectCode({
      templateFields: {
        template_id: { table: "templates", automationKind: "ugc" },
      },
      mediaCollectionFields: { actor_collection_id: "image" },
    })
  )}
`
}

type TemplateSelectorFilter = {
  table: "templates" | "social_templates"
  automationKind?: "slideshow" | "video" | "ugc"
  videoFormat?: string
  excludedVideoFormats?: string[]
  platforms?: Array<"x" | "threads">
}

function workflowDynamicSelectCode(input: {
  templateFields?: Record<string, TemplateSelectorFilter>
  hookFields?: Record<string, { templateField: string }>
  mediaCollectionFields?: Record<string, "video" | "image">
}) {
  const templateEntrypoints = Object.entries(input.templateFields ?? {}).map(
    ([field, filter]) =>
      `export async function ${field}(filterText = "") {\n  return templateOptions(${JSON.stringify(filter)}, filterText)\n}`
  )
  const hookEntrypoints = Object.entries(input.hookFields ?? {}).map(
    ([field, config]) =>
      `export async function ${field}(${config.templateField} = "", filterText = "") {\n  return hookOptions(${config.templateField}, filterText)\n}`
  )
  const mediaEntrypoints = Object.entries(
    input.mediaCollectionFields ?? {}
  ).map(
    ([field, kind]) =>
      `export async function ${field}(filterText = "") {\n  return mediaCollections(${JSON.stringify(kind)}, filterText)\n}`
  )
  const entrypoints = [
    ...templateEntrypoints,
    ...hookEntrypoints,
    ...mediaEntrypoints,
  ].join("\n\n")
  return `import { Client, Query, TablesDB } from "node-appwrite"
import * as wmill from "windmill-client"

${entrypoints}

async function templateOptions(config: {
  table: "templates" | "social_templates"
  automationKind?: string
  videoFormat?: string
  excludedVideoFormats?: string[]
  platforms?: string[]
}, filterText = "") {
  const { tables, databaseId, ownerId } = await appwrite()
  const response = await tables.listRows(databaseId, config.table, [
    Query.equal("owner_id", [ownerId]),
    Query.limit(100),
  ])
  const query = clean(filterText).toLowerCase()
  return response.rows.flatMap((row) => {
    const record = parseRecord(row.data)
    if (!record || record.hidden === true || record.deletedAt) return []
    const schema = parseRecord(record.schema) || {}
    const automationKind = clean(schema.automationKind)
    const videoFormat = clean(parseRecord(schema.video_format)?.template)
    const platform = clean(record.platform)
    if (config.automationKind && automationKind !== config.automationKind) return []
    if (config.videoFormat && videoFormat !== config.videoFormat) return []
    if (config.excludedVideoFormats?.includes(videoFormat)) return []
    if (config.platforms?.length && !config.platforms.includes(platform)) return []
    const value = clean(record.id) || clean(row.rid)
    const name = clean(record.name)
    if (!value || !name) return []
    const detail = platform || videoFormat.replaceAll("_", " ") || automationKind
    const label = detail ? name + " · " + detail : name
    if (query && !label.toLowerCase().includes(query)) return []
    return [{ value, label }]
  })
}

async function hookOptions(templateId = "", filterText = "") {
  const id = clean(templateId)
  if (!id) return []
  const { tables, databaseId, ownerId } = await appwrite()
  const response = await tables.listRows(databaseId, "templates", [
    Query.equal("owner_id", [ownerId]),
    Query.equal("rid", [id]),
    Query.limit(1),
  ])
  const record = parseRecord(response.rows[0]?.data)
  const schema = parseRecord(record?.schema)
  const hooks = Array.isArray(schema?.hooks) ? schema.hooks : []
  const query = clean(filterText).toLowerCase()
  return hooks.flatMap((candidate) => {
    const hook = parseRecord(candidate)
    const text = clean(hook?.text)
    if (!text || hook?.enabled === false) return []
    if (query && !text.toLowerCase().includes(query)) return []
    return [{ value: text, label: text }]
  })
}

async function mediaCollections(kind: "video" | "image", filterText = "") {
  const { tables, databaseId, ownerId } = await appwrite()
  const response = await tables.listRows(
    databaseId,
    "permanent_assets",
    [
      Query.equal("owner_id", [ownerId]),
      Query.equal("source_key", ["image_collection"]),
      Query.limit(100),
    ]
  )
  const query = String(filterText || "").trim().toLowerCase()
  return response.rows.flatMap((row) => {
    const collection = parseRecord(row.data)
    if (!collection || collection.deletedAt) return []
    const mediaKind = collection.mediaType === "video" ? "video" : "image"
    const assetCount = Array.isArray(collection.images)
      ? collection.images.filter((asset) => clean(asset?.image_link)).length
      : 0
    const name = clean(collection.name)
    if (!name || !assetCount || mediaKind !== kind) return []
    const label = name + " (" + assetCount + ")"
    if (query && !label.toLowerCase().includes(query)) return []
    return [{
      value: clean(collection.id) || clean(collection.externalId) || slug(name),
      label,
      mediaKind,
      assetCount,
    }]
  })
}

async function appwrite() {
  const [runtimeEnv, defaultOwnerId] = await Promise.all([
    wmill.getVariable("f/lumenclip/runtime_env_json"),
    wmill.getVariable("f/lumenclip/default_owner_id"),
  ])
  const env = JSON.parse(required("runtime_env_json", runtimeEnv))
  const client = new Client()
    .setEndpoint(required("APPWRITE_ENDPOINT", env.APPWRITE_ENDPOINT))
    .setProject(required("APPWRITE_PROJECT_ID", env.APPWRITE_PROJECT_ID))
    .setKey(required("APPWRITE_API_KEY", env.APPWRITE_API_KEY))
  return {
    tables: new TablesDB(client),
    databaseId: required("APPWRITE_DATABASE_ID", env.APPWRITE_DATABASE_ID),
    ownerId: required("default_owner_id", defaultOwnerId),
  }
}

function required(name: string, value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) throw new Error("Lumenclip variable " + name + " is not configured")
  return text
}

function parseRecord(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
`
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
