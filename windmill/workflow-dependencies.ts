import type { PipelineWorkflowId } from "../lib/pipeline-stages"

export type WorkflowDependency = {
  consumer: string
  handler: string
  producers: string[]
  reads: string[]
  writes: string[]
}

const dependency = (
  consumer: string,
  handler: string,
  producers: string[],
  reads: string[],
  writes: string[]
): WorkflowDependency => ({ consumer, handler, producers, reads, writes })

export const WINDMILL_WORKFLOW_DEPENDENCIES: Record<
  PipelineWorkflowId,
  WorkflowDependency[]
> = {
  "slideshow-generation": [
    dependency(
      "validate_input",
      "slideshow-generation.validate-input",
      ["load_template", "load_collections", "load_word_collections"],
      ["automationRecord", "collections", "wordCollections"],
      ["schema", "textAutomation", "slideSpecs"]
    ),
    dependency(
      "load_model_settings",
      "slideshow-generation.load-model-settings",
      ["validate_input"],
      ["generationSettings"],
      ["textModel"]
    ),
    dependency(
      "prepare_image_candidate_pools",
      "slideshow-generation.prepare-image-candidate-pools",
      ["validate_input"],
      ["textAutomation", "collections"],
      ["candidatesBySlide"]
    ),
    dependency(
      "select_expand_hook",
      "slideshow-generation.select-expand-hook",
      ["load_model_settings", "apply_fixed_slide_count"],
      ["schema", "wordCollections", "slideCount"],
      ["hook"]
    ),
    dependency(
      "build_image_shortlists",
      "slideshow-generation.build-image-shortlists",
      ["generate_slide_text", "prepare_image_candidate_pools"],
      ["generatedText", "candidatesBySlide"],
      ["shortlists"]
    ),
    dependency(
      "assemble_plan",
      "slideshow-generation.assemble-plan",
      ["generate_slide_text", "select_slide_images"],
      ["generatedText", "selectedImages", "slideSpecs"],
      ["plan"]
    ),
    dependency(
      "validate_output",
      "slideshow-generation.validate-output",
      ["render_store_pngs"],
      ["plan", "renderedOutput"],
      ["qa", "runRecord"]
    ),
  ],
  "ugc-video-generation": [
    dependency(
      "resolve_product_component",
      "ugc-video-generation.resolve-product-component",
      ["load_template_defaults"],
      ["templateDefaults", "productOverride"],
      ["productComponent"]
    ),
    dependency(
      "analyze_product",
      "ugc-video-generation.analyze-product",
      ["resolve_product_component"],
      ["productComponent"],
      ["analysis"]
    ),
    dependency(
      "resolve_script_component",
      "ugc-video-generation.resolve-script-component",
      ["load_template_defaults"],
      ["templateDefaults", "scriptOverride"],
      ["scriptComponent"]
    ),
    dependency(
      "generate_script_plan",
      "ugc-video-generation.generate-script-plan",
      ["analyze_product", "resolve_script_component"],
      ["analysis", "scriptComponent"],
      ["script"]
    ),
    dependency(
      "resolve_actor",
      "ugc-video-generation.resolve-generate-actor",
      ["resolve_actor_component", "analyze_product", "generate_script_plan"],
      ["actorComponent", "analysis", "script"],
      ["actor"]
    ),
    dependency(
      "animate_actor",
      "ugc-video-generation.animate-actor",
      ["resolve_actor"],
      ["actor"],
      ["motion"]
    ),
    dependency(
      "synthesize_voice",
      "ugc-video-generation.synthesize-voice",
      ["resolve_voice_component", "generate_script_plan"],
      ["voiceComponent", "script"],
      ["voice"]
    ),
    dependency(
      "lip_sync_performance",
      "ugc-video-generation.lip-sync-performance",
      ["animate_actor", "synthesize_voice"],
      ["motion", "voice"],
      ["lipsync"]
    ),
    dependency(
      "assemble_performance",
      "ugc-video-generation.assemble-performance",
      ["synthesize_voice", "lip_sync_performance"],
      ["voice", "lipsync"],
      ["performance"]
    ),
    dependency(
      "generate_broll",
      "ugc-video-generation.generate-broll",
      ["resolve_broll_component", "generate_script_plan"],
      ["brollComponent", "script"],
      ["broll"]
    ),
    dependency(
      "composite_output",
      "ugc-video-generation.composite-output",
      [
        "assemble_performance",
        "generate_broll",
        "resolve_render_component",
        "generate_script_plan",
      ],
      ["performance", "broll", "renderComponent", "script"],
      ["composite"]
    ),
    dependency(
      "store_final_output",
      "ugc-video-generation.store-final-output",
      ["composite_output", "generate_script_plan"],
      ["composite", "script"],
      ["draftVideo"]
    ),
  ],
  "react-reveal-generation": fixedVideoDependencies(
    "react-reveal-generation",
    "anticipation",
    "reveal"
  ),
  "greenscreen-meme-generation": fixedVideoDependencies(
    "greenscreen-meme-generation",
    "meme",
    "background"
  ),
  "template-video-generation": [
    dependency(
      "generate_copy",
      "template-video-generation.generate-copy",
      ["load_template"],
      ["template.schema", "template.hooks"],
      ["copy"]
    ),
    dependency(
      "resolve_media",
      "template-video-generation.resolve-media",
      ["load_template"],
      ["template.videoFormat", "template.mediaBindings"],
      ["resolvedMedia"]
    ),
    dependency(
      "assemble_components",
      "template-video-generation.assemble-components",
      ["generate_copy", "resolve_media"],
      ["copy", "resolvedMedia"],
      ["components"]
    ),
    dependency(
      "stage_media",
      "template-video-generation.stage-media",
      ["assemble_components"],
      ["components.clips", "components.audioUrl"],
      ["stagedMedia"]
    ),
    dependency(
      "build_render_command",
      "template-video-generation.build-render-command",
      ["stage_media"],
      ["components", "stagedMedia"],
      ["rendiCommandRequest"]
    ),
    dependency(
      "render_store_output",
      "template-video-generation.render-store-output",
      ["build_render_command"],
      ["rendiCommandRequest", "rendiLocalInputs"],
      ["videoUrl", "thumbnailUrl"]
    ),
    dependency(
      "finalize_output",
      "template-video-generation.finalize-output",
      ["render_store_output"],
      ["videoUrl", "thumbnailUrl", "components"],
      ["finalOutput"]
    ),
  ],
  "linkedin-generation": [
    dependency(
      "validate_input",
      "linkedin-generation.validate-input",
      [
        "normalize_audience_topic",
        "normalize_voice_proof",
        "normalize_brief_controls",
        "normalize_batch_controls",
      ],
      ["audience", "voiceProof", "briefControls", "batchControls"],
      ["normalizedInput"]
    ),
    dependency(
      "resolve_brief",
      "linkedin-generation.resolve-brief",
      ["validate_input"],
      [
        "normalizedInput.brief",
        "normalizedInput.niche",
        "normalizedInput.briefModel",
      ],
      ["brief"]
    ),
    dependency(
      "select_post_plan",
      "linkedin-generation.select-post-plan",
      ["validate_input", "resolve_brief"],
      ["normalizedInput", "brief"],
      ["plan"]
    ),
    dependency(
      "build_generation_request",
      "linkedin-generation.build-generation-request",
      ["validate_input", "resolve_brief", "select_post_plan"],
      ["normalizedInput", "brief", "plan"],
      ["generationRequest"]
    ),
  ],
  "x-threads-generation": [
    dependency(
      "validate_input",
      "x-threads-generation.validate-input",
      ["load_template", "normalize_run_input"],
      ["automation", "runInput"],
      ["validatedInput"]
    ),
    dependency(
      "resolve_brief",
      "x-threads-generation.resolve-brief",
      ["validate_input"],
      ["automation", "deriveBrief"],
      ["brief"]
    ),
    dependency(
      "select_content_plan",
      "x-threads-generation.select-content-plan",
      ["resolve_brief"],
      ["automation", "topic", "brief"],
      ["plan"]
    ),
    dependency(
      "benchmark_build_run",
      "x-threads-generation.benchmark-build-run",
      ["repair_draft"],
      ["acceptedDraft", "plan"],
      ["builtRun"]
    ),
    dependency(
      "generate_image",
      "x-threads-generation.generate-image",
      ["persist_text_run", "prepare_image_task"],
      ["persistedRun", "imageTask"],
      ["publishableRun"]
    ),
  ],
}

function fixedVideoDependencies(
  workflowId: "react-reveal-generation" | "greenscreen-meme-generation",
  primary: string,
  secondary: string
) {
  return [
    dependency(
      `resolve_${primary}`,
      `${workflowId}.resolve-${primary}`,
      ["load_template_defaults"],
      ["templateDefaults", `${primary}Override`],
      [`${primary}Component`]
    ),
    dependency(
      `stage_${primary}`,
      `${workflowId}.stage-${primary}`,
      [`resolve_${primary}`],
      [`${primary}Component`],
      [`staged${primary}`]
    ),
    dependency(
      `resolve_${secondary}`,
      `${workflowId}.resolve-${secondary}`,
      ["load_template_defaults"],
      ["templateDefaults", `${secondary}Override`],
      [`${secondary}Component`]
    ),
    dependency(
      `stage_${secondary}`,
      `${workflowId}.stage-${secondary}`,
      [`resolve_${secondary}`],
      [`${secondary}Component`],
      [`staged${secondary}`]
    ),
    dependency(
      "stage_audio",
      `${workflowId}.stage-audio`,
      ["resolve_audio"],
      ["audioComponent"],
      ["stagedAudio"]
    ),
    dependency(
      "build_render_command",
      `${workflowId}.build-render-command`,
      [
        `stage_${primary}`,
        `stage_${secondary}`,
        "stage_audio",
        "resolve_caption",
      ],
      [
        `staged${primary}`,
        `staged${secondary}`,
        "stagedAudio",
        "captionComponent",
      ],
      ["renderPlan"]
    ),
    dependency(
      "finalize_output",
      `${workflowId}.finalize-output`,
      ["render_store_output", "resolve_output"],
      ["renderedMedia", "outputMetadata"],
      ["draftVideo"]
    ),
  ]
}
