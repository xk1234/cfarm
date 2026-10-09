import type { AutomationRunApiRecord } from "./types"
import type {
  WorkflowArtifactKind,
  WorkflowInspectorRun,
  WorkflowStageStatus,
} from "@/components/realfarm/workflow-inspector/types"

export type SlideshowWorkflowRun = Omit<
  AutomationRunApiRecord,
  "socialStatuses"
>

export function slideshowWorkflowStorageKey(runId: string) {
  return `lumenclip:slideshow-workflow:${runId}`
}

export type SlideshowWorkflowStepStatus =
  "pending" | "running" | "complete" | "failed"

export type SlideshowWorkflowStep = {
  id: string
  label: string
  status: SlideshowWorkflowStepStatus
  input: unknown
  output?: unknown
}

type StepData = Omit<SlideshowWorkflowStep, "status">

export function buildSlideshowWorkflowSteps(
  run: SlideshowWorkflowRun
): SlideshowWorkflowStep[] {
  const plannedSlides = run.plan?.slides ?? []
  const renderedSlides = run.renderedSlides ?? []
  const steps: Array<StepData & { complete: boolean }> = [
    {
      id: "load-run",
      label: "Load generation input",
      complete: Boolean(run.id && run.automationId),
      input: {
        automationId: run.automationId,
        scheduledFor: run.scheduledFor,
        generationSource: run.generationSource ?? "scheduled",
        requestId: run.requestId,
      },
      output: {
        runId: run.id,
        automationTitle: run.automationTitle,
      },
    },
    {
      id: "select-hook",
      label: "Select and expand hook",
      complete: Boolean(run.plan?.hook),
      input: {
        hookCandidates: run.plan?.hookCandidates ?? [],
        selectedHookIndex: run.plan?.debug?.selectedHookIndex,
      },
      output: run.plan?.hook
        ? {
            hook: run.plan.hook,
            hookId: run.plan.hookId,
          }
        : undefined,
    },
    {
      id: "generate-text",
      label: "Generate slideshow text",
      complete: Boolean(run.plan?.title && plannedSlides.length),
      input: run.plan?.debug?.textModelPrompt ?? {
        hook: run.plan?.hook,
        language: run.plan?.language,
      },
      output:
        run.plan?.title || plannedSlides.length
          ? {
              model: run.plan?.textModel,
              title: run.plan?.title,
              caption: run.plan?.caption,
              hashtags: run.plan?.hashtags,
              providerResult: run.plan?.debug?.textGenerationResult,
              generatedCaption: run.plan?.debug?.generatedCaption,
              transformations: run.plan?.debug?.textTransformations,
              webSearchSources: run.plan?.debug?.webSearchSources,
              slides: plannedSlides.map((slide, index) => ({
                index: index + 1,
                id: slide.id,
                text: slide.text,
              })),
            }
          : undefined,
    },
    {
      id: "select-images",
      label: "Select slide images",
      complete: Boolean(
        plannedSlides.length &&
        plannedSlides.every((slide) =>
          Boolean(slide.imageUrl || slide.sourceImageUrl)
        )
      ),
      input: {
        collectionIds: run.plan?.imageCollectionIds ?? [],
        slides: plannedSlides.map((slide, index) => ({
          index: index + 1,
          id: slide.id,
          imageCaption: slide.imageCaption,
        })),
      },
      output: plannedSlides.length
        ? {
            slides: plannedSlides.map((slide, index) => ({
              index: index + 1,
              id: slide.id,
              imageUrl: slide.imageUrl || slide.sourceImageUrl,
              imageCaption: slide.imageCaption,
            })),
            reuseWarnings: run.plan?.reuseWarnings ?? [],
          }
        : undefined,
    },
    {
      id: "render-slides",
      label: "Render and store slides",
      complete: Boolean(
        run.slideshowId || renderedSlides.length || run.outputImages?.length
      ),
      input: {
        slides: plannedSlides,
        publishType: run.plan?.publishType ?? "slideshow",
      },
      output:
        run.slideshowId || renderedSlides.length || run.outputImages?.length
          ? {
              slideshowId: run.slideshowId,
              outputDir: run.outputDir,
              outputImages: run.outputImages ?? [],
              renderedSlides,
              videoUrl: run.videoUrl,
            }
          : undefined,
    },
  ]

  const firstIncomplete = steps.findIndex((step) => !step.complete)
  return steps.map(({ complete, ...step }, index) => ({
    ...step,
    status: stepStatus(run, complete, index, firstIncomplete),
  }))
}

export function suggestedSlideshowStepIndex(steps: SlideshowWorkflowStep[]) {
  const active = steps.findIndex(
    (step) => step.status === "running" || step.status === "failed"
  )
  if (active >= 0) return active
  const lastComplete = steps.findLastIndex((step) => step.status === "complete")
  return Math.max(0, lastComplete)
}

export function buildSlideshowInspectorRun(
  run: SlideshowWorkflowRun
): WorkflowInspectorRun {
  const steps = buildSlideshowWorkflowSteps(run)
  const stageDetails: Record<
    string,
    {
      shortLabel: string
      description: string
      kind: string
      inputKind: WorkflowArtifactKind
      resultKind: WorkflowArtifactKind
    }
  > = {
    "load-run": {
      shortLabel: "Inputs",
      description:
        "The resolved automation, schedule, and generation source received by this run.",
      kind: "storage",
      inputKind: "metadata",
      resultKind: "metadata",
    },
    "select-hook": {
      shortLabel: "Hook",
      description:
        "The eligible hook candidates and the exact hook selected for this slideshow.",
      kind: "deterministic",
      inputKind: "metadata",
      resultKind: "copy",
    },
    "generate-text": {
      shortLabel: "Generate",
      description:
        "The resolved provider prompt and the ordered slide copy returned by the model.",
      kind: "provider",
      inputKind: "prompt",
      resultKind: "storyboard",
    },
    "select-images": {
      shortLabel: "Images",
      description:
        "The source collection constraints and the visual selected for each ordered slide.",
      kind: "deterministic",
      inputKind: "storyboard",
      resultKind: "media-gallery",
    },
    "render-slides": {
      shortLabel: "Complete",
      description:
        "The stored, publishable slideshow artifact produced by the completed run.",
      kind: "storage",
      inputKind: "storyboard",
      resultKind: "final",
    },
  }

  return {
    id: run.id,
    workflowName: run.automationTitle || "Slideshow generation",
    status:
      run.status === "failed"
        ? "failed"
        : run.status === "running"
          ? "running"
          : "succeeded",
    startedAt: run.createdAt || run.scheduledFor,
    completedAt:
      run.status === "running" ? undefined : run.updatedAt || run.createdAt,
    stages: steps.map((step) => {
      const detail = stageDetails[step.id]
      const canRun =
        step.id === "generate-text" && Boolean(run.plan?.debug?.textModelPrompt)
      return {
        id: step.id,
        shortLabel: detail.shortLabel,
        title: step.label,
        description: detail.description,
        kind: detail.kind,
        status: inspectorStatus(step.status),
        input: {
          kind: detail.inputKind,
          value:
            step.id === "generate-text"
              ? enrichPrompt(step.input, run.plan?.textModel)
              : step.input,
        },
        result: step.output
          ? {
              kind: detail.resultKind,
              value:
                step.id === "render-slides"
                  ? {
                      ...asRecord(step.output),
                      title: run.plan?.title,
                      caption: run.plan?.caption,
                      slides: run.renderedSlides ?? run.plan?.slides,
                    }
                  : step.output,
            }
          : undefined,
        rawInput: step.input,
        rawResult: step.output,
        canRun,
        runDisabledReason: canRun
          ? undefined
          : "This historical stage does not have enough persisted dependencies to run independently.",
      }
    }),
  }
}

function inspectorStatus(
  status: SlideshowWorkflowStepStatus
): WorkflowStageStatus {
  return status === "complete" ? "succeeded" : status
}

function enrichPrompt(value: unknown, model?: string) {
  const record = asRecord(value)
  return record
    ? { provider: "OpenRouter", attempt: 1, model, ...record }
    : value
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stepStatus(
  run: SlideshowWorkflowRun,
  complete: boolean,
  index: number,
  firstIncomplete: number
): SlideshowWorkflowStepStatus {
  if (complete) return "complete"
  if (index !== firstIncomplete) return "pending"
  if (run.status === "failed") return "failed"
  if (run.status === "running") return "running"
  return "pending"
}
