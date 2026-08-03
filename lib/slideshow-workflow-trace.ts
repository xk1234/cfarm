import type { AutomationRunRecord } from "@/lib/automation-runner"
import type { AutomationOutputQaReport } from "@/lib/automation-output-qa"
import type { AutomationRecord } from "@/lib/automations"
import { pipelineStagesForWorkflow } from "@/lib/pipeline-stages"
import type { SlideshowRecord } from "@/lib/slideshows"

export type SlideshowWorkflowTraceStage = {
  id: string
  order: number
  title: string
  description: string
  kind: "deterministic" | "provider" | "storage"
  provider?: string
  model?: string
  optional?: boolean
  status: "succeeded" | "skipped" | "failed"
  dataSource: "persisted" | "reconstructed"
  input: Record<string, unknown>
  output: Record<string, unknown>
}

export type SlideshowWorkflowTrace = {
  workflowId: "slideshow-generation"
  runId: string
  outputId: string
  automationId: string
  title: string
  status: AutomationRunRecord["status"]
  captureMode: "reconstructed_from_persisted_run"
  createdAt: string
  updatedAt: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  stages: SlideshowWorkflowTraceStage[]
}

export function buildSlideshowWorkflowTrace(input: {
  run: AutomationRunRecord
  automation?: AutomationRecord | null
  slideshow?: SlideshowRecord | null
  qa?: AutomationOutputQaReport
  renderedImageUrls?: string[]
}): SlideshowWorkflowTrace {
  const { run, automation, slideshow } = input
  const schema = automation?.schema
  const plan = run.plan
  const renderedImageUrls = input.renderedImageUrls?.length
    ? input.renderedImageUrls
    : (run.outputImages ?? slideshow?.output_images ?? [])
  const bodySlides = plan.slides.filter((slide) => slide.role === "content")
  const promptInputs = schema
    ? {
        promptFormatting: schema.prompt_formatting,
        tone: schema.tone,
        webSearchEnabled: schema.web_search_enabled === true,
        textItems: schema.formatting.map((section) => ({
          section: section.id,
          noText: section.noText,
          slideCount: section.slideCount,
          slideCountMode: section.slideCountMode,
          slideCountMin: section.slideCountMin,
          slideCountMax: section.slideCountMax,
          slideOverrides: section.slideOverrides ?? [],
          textItems: section.textItems.map((item) => ({
            id: item.id,
            mode: item.textMode,
            contentDirection: item.contentDirection,
            staticText:
              item.textMode === "static" ? item.staticText : undefined,
            wordLengthMin: item.wordLengthMin,
            wordLengthMax: item.wordLengthMax,
          })),
        })),
      }
    : { unavailable: "The automation configuration was not found." }
  const selectedImages = plan.slides.map((slide, index) => ({
    slide: index + 1,
    slideId: slide.id,
    role: slide.role,
    imageKey: slide.imageKey,
    imageCaption: slide.imageCaption,
    sourceImageUrl: slide.imageUrl,
  }))
  const generatedText = {
    title: plan.title,
    caption: plan.caption,
    hashtags: plan.hashtags,
    slides: plan.slides.map((slide, index) => ({
      slide: index + 1,
      slideId: slide.id,
      role: slide.role,
      text: slide.text,
      textItems: slide.textItems?.map((item) => ({
        id: item.id,
        text: item.text,
      })),
    })),
  }
  const finalOutput = {
    outputId: run.slideshowId || slideshow?.id || run.id,
    title: plan.title,
    caption: plan.caption,
    hashtags: plan.hashtags,
    slideCount: plan.slides.length,
    slides: plan.slides.map((slide, index) => ({
      slide: index + 1,
      id: slide.id,
      role: slide.role,
      text: slide.text,
      textItems: slide.textItems,
      sourceImageUrl: slide.imageUrl,
      renderedImageUrl:
        renderedImageUrls[index] ?? run.renderedSlides?.[index]?.imageUrl,
    })),
    videoUrl: run.videoUrl || slideshow?.video_url || undefined,
    qa: input.qa,
    publication: {
      statuses: run.socialStatuses ?? [],
      manuallyPublishedAt: run.manuallyPublishedAt,
    },
  }
  const workflowInput = {
    run: {
      id: run.id,
      automationId: run.automationId,
      generationSource: run.generationSource,
      requestId: run.requestId,
      scheduledFor: run.scheduledFor,
      createdAt: run.createdAt,
    },
    automation: automation
      ? {
          id: automation.id,
          name: automation.name,
          status: automation.status,
          updatedAt: automation.updatedAt,
          schema: {
            kind: schema?.automationKind,
            aspectRatio: schema?.aspect_ratio,
            imageFit: schema?.image_fit,
            language: schema?.language,
            imageCollections: schema?.image_collection_ids,
            schedule: schema?.schedule,
            postingMode: schema?.posting_mode,
            publishType: schema?.tiktok_post_settings.publish_type,
            prompts: promptInputs,
          },
        }
      : null,
  }
  const stagePayloads = new Map<
    string,
    Pick<
      SlideshowWorkflowTraceStage,
      "status" | "dataSource" | "input" | "output"
    >
  >([
    [
      "slideshow-generation.validate-input",
      observed({
        input: workflowInput,
        output: {
          automationId: run.automationId,
          automationTitle: run.automationTitle,
          imageCollectionIds: plan.imageCollectionIds,
          language: plan.language,
          publishType: plan.publishType,
          promptInputs,
        },
      }),
    ],
    [
      "slideshow-generation.resolve-slide-count",
      observed({
        input: {
          configured: plan.slideCount,
          hookTemplate: plan.hookTemplate,
          hookSubstitutions: plan.hookSubstitutions,
        },
        output: {
          totalSlides: plan.slides.length,
          bodySlides: bodySlides.length,
          hookSlides: plan.slides.filter((slide) => slide.role === "hook")
            .length,
          ctaSlides: plan.slides.filter((slide) => slide.role === "cta").length,
        },
      }),
    ],
    [
      "slideshow-generation.select-expand-hook",
      observed({
        input: {
          candidates: plan.hookCandidates ?? [],
          selectedIndex: plan.debug?.selectedHookIndex,
          template: plan.hookTemplate,
        },
        output: {
          hookId: plan.hookId,
          resolvedHook: plan.hook,
          substitutions: plan.hookSubstitutions ?? {},
        },
      }),
    ],
    [
      "slideshow-generation.research-hook",
      optionalStage(Boolean(plan.debug?.webSearchSources?.length), {
        input: {
          enabled: schema?.web_search_enabled === true,
          hook: plan.hook,
        },
        output: {
          sources: plan.debug?.webSearchSources ?? [],
        },
      }),
    ],
    [
      "slideshow-generation.build-text-prompt",
      observed({
        input: {
          hook: plan.hook,
          customPrompts: promptInputs,
          contentStrategy: plan.contentStrategy,
        },
        output: {
          promptPayload: plan.debug?.textModelPrompt ?? null,
          note: plan.debug?.textModelPrompt
            ? undefined
            : "The exact provider payload was not retained for this run.",
        },
      }),
    ],
    [
      "slideshow-generation.generate-slide-text",
      observed({
        input: {
          model: plan.textModel,
          promptPayload: plan.debug?.textModelPrompt ?? null,
        },
        output: generatedText,
      }),
    ],
    [
      "slideshow-generation.retry-text-similarity",
      optionalStage(plan.debug?.textSimilarityRetry === true, {
        input: {
          retryRequired: plan.debug?.textSimilarityRetry === true,
          reusePolicy: schema?.reuse_policy,
        },
        output: {
          retryRan: plan.debug?.textSimilarityRetry === true,
          transformations: plan.debug?.textTransformations ?? [],
        },
      }),
    ],
    [
      "slideshow-generation.derive-visual-concepts",
      reconstructed({
        input: {
          aiImageSelection: aiImageSelectionEnabled(automation),
          generatedText,
        },
        output: {
          concepts: plan.slides.map((slide, index) => ({
            slide: index + 1,
            imageCaption: slide.imageCaption,
          })),
          note: "The final persisted visual concepts are shown; the provider's transient reasoning is not stored.",
        },
      }),
    ],
    [
      "slideshow-generation.build-image-shortlists",
      reconstructed({
        input: {
          imageCollectionIds: plan.imageCollectionIds,
          slideTexts: generatedText.slides,
        },
        output: {
          selectedAssets: selectedImages,
          note: "Candidate shortlists were transient; the durable selected asset from each shortlist is shown.",
        },
      }),
    ],
    [
      "slideshow-generation.select-slide-images",
      observed({
        input: {
          aiImageSelection: aiImageSelectionEnabled(automation),
          imageCollectionIds: plan.imageCollectionIds,
        },
        output: { selectedImages, reuseWarnings: plan.reuseWarnings ?? [] },
      }),
    ],
    [
      "slideshow-generation.assemble-plan",
      observed({
        input: { generatedText, selectedImages },
        output: {
          title: plan.title,
          contentStrategy: plan.contentStrategy,
          slides: plan.slides,
        },
      }),
    ],
    [
      "slideshow-generation.translate-plan",
      optionalStage(Boolean(plan.translationProvider), {
        input: {
          language: plan.language,
          provider: plan.translationProvider,
          slides: generatedText.slides,
        },
        output: {
          translated: Boolean(plan.translationProvider),
          language: plan.language,
          slides: generatedText.slides,
        },
      }),
    ],
    [
      "slideshow-generation.render-store-pngs",
      observed({
        input: {
          aspectRatio: schema?.aspect_ratio,
          font: schema?.font,
          imageFit: schema?.image_fit,
          slides: plan.slides,
        },
        output: {
          outputDir: run.outputDir || slideshow?.output_dir,
          renderedSlides: plan.slides.map((slide, index) => ({
            slide: index + 1,
            sourceImageUrl: slide.imageUrl,
            renderedImageUrl:
              renderedImageUrls[index] ?? run.renderedSlides?.[index]?.imageUrl,
          })),
        },
      }),
    ],
    [
      "slideshow-generation.render-store-mp4",
      optionalStage(Boolean(run.videoUrl || slideshow?.video_url), {
        input: {
          publishType: plan.publishType,
          renderedImages: renderedImageUrls,
        },
        output: {
          videoUrl: run.videoUrl || slideshow?.video_url || null,
          thumbnailUrl: run.thumbnailUrl || slideshow?.thumbnail_url || null,
        },
      }),
    ],
    [
      "slideshow-generation.validate-output",
      observed({
        input: {
          hook: plan.hook,
          slides: generatedText.slides,
          configuredPrompts: promptInputs,
        },
        output: input.qa ?? {
          available: false,
          note: "QA was not recalculated for this trace.",
        },
      }),
    ],
    [
      "slideshow-generation.finalize-output",
      observed({
        input: {
          runId: run.id,
          outputId: run.slideshowId || slideshow?.id,
          qa: input.qa,
          reuseWarnings: plan.reuseWarnings ?? [],
        },
        output: finalOutput,
      }),
    ],
  ])

  const stages = pipelineStagesForWorkflow("slideshow-generation").map(
    (metadata) => {
      const payload = stagePayloads.get(metadata.id)
      return {
        id: metadata.id,
        order: metadata.order,
        title: metadata.title,
        description: metadata.description,
        kind: metadata.kind,
        provider: metadata.provider,
        model: metadata.model,
        optional: metadata.optional,
        ...(payload ??
          reconstructed({
            input: {},
            output: {
              note: "No durable stage snapshot exists for this historical run.",
            },
          })),
      }
    }
  )

  return {
    workflowId: "slideshow-generation",
    runId: run.id,
    outputId: run.slideshowId || slideshow?.id || run.id,
    automationId: run.automationId,
    title: plan.title || run.automationTitle,
    status: run.status,
    captureMode: "reconstructed_from_persisted_run",
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    input: workflowInput,
    output: finalOutput,
    stages,
  }
}

function aiImageSelectionEnabled(automation?: AutomationRecord | null) {
  return Boolean(
    automation?.schema.formatting.some(
      (section) => section.aiImageSelection === true
    )
  )
}

function observed(input: {
  input: Record<string, unknown>
  output: Record<string, unknown>
}) {
  return {
    status: "succeeded" as const,
    dataSource: "persisted" as const,
    ...input,
  }
}

function reconstructed(input: {
  input: Record<string, unknown>
  output: Record<string, unknown>
}) {
  return {
    status: "succeeded" as const,
    dataSource: "reconstructed" as const,
    ...input,
  }
}

function optionalStage(
  ran: boolean,
  input: {
    input: Record<string, unknown>
    output: Record<string, unknown>
  }
) {
  return {
    status: ran ? ("succeeded" as const) : ("skipped" as const),
    dataSource: "persisted" as const,
    ...input,
  }
}
