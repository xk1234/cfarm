import type {
  AutomationPostingMode,
  AutomationUgcConfig,
} from "@/lib/realfarm-automation"
import type {
  UgcDisplayStageStatus,
  UgcRunStage,
  UgcRunStatus,
} from "@/lib/ugc-run-status"
import type { UgcStageName } from "@/lib/ugc-automation-runner"
import type { UgcCostBreakdown } from "@/lib/ugc-cost"
import type {
  WorkflowArtifactKind,
  WorkflowInspectorRun,
  WorkflowStageStatus,
} from "@/components/realfarm/workflow-inspector/types"

export type UgcWorkflowContext = {
  name: string
  config: AutomationUgcConfig
  postingMode: AutomationPostingMode
  socialProviders: string[]
}

export type UgcWorkflowStep = UgcRunStage & {
  label: string
  description: string
  input: Record<string, unknown>
  output: unknown | null
  rawOutput: unknown | null
}

const stageCopy: Record<UgcStageName, { label: string; description: string }> =
  {
    analysis: {
      label: "Analyze product",
      description:
        "Extract the product facts, audience, proof, and visual cues.",
    },
    script: {
      label: "Write script plan",
      description: "Turn the product analysis into a timed UGC script.",
    },
    actor: {
      label: "Prepare actor",
      description: "Resolve or generate the presenter image used by the video.",
    },
    voice: {
      label: "Generate voice",
      description: "Synthesize the spoken script and word timings.",
    },
    motion: {
      label: "Animate actor",
      description: "Convert the actor image into a natural performance clip.",
    },
    lipsync: {
      label: "Sync voice and video",
      description: "Align the generated voice with the actor performance.",
    },
    broll: {
      label: "Generate B-roll",
      description:
        "Create the timed supporting visuals requested by the script.",
    },
    composite: {
      label: "Assemble video",
      description:
        "Combine the actor, voice, B-roll, captions, and hook overlay.",
    },
    store: {
      label: "Save output",
      description: "Persist the final video, thumbnail, and generation record.",
    },
    publish: {
      label: "Prepare publishing",
      description:
        "Send the output to its configured publishing or review path.",
    },
  }

export function buildUgcWorkflowSteps(
  run: UgcRunStatus,
  workflow: UgcWorkflowContext
): UgcWorkflowStep[] {
  return run.stages.map((stage) => {
    const copy = stageCopy[stage.name]
    const rawOutput = run.checkpoints[stage.name] ?? null
    return {
      ...stage,
      ...copy,
      input: stageInput(stage.name, run, workflow),
      output: stageOutput(stage.name, rawOutput),
      rawOutput,
    }
  })
}

export function suggestedUgcStageIndex(stages: UgcRunStage[]) {
  const current = stages.findIndex(
    (stage) => stage.status === "active" || stage.status === "failed"
  )
  if (current >= 0) return current
  const lastDone = stages.findLastIndex((stage) => stage.status === "done")
  return lastDone >= 0 ? lastDone : 0
}

export function buildUgcInspectorRun(input: {
  run: UgcRunStatus
  workflow: UgcWorkflowContext
  estimate: UgcCostBreakdown
  actual: UgcCostBreakdown
}): WorkflowInspectorRun {
  const steps = buildUgcWorkflowSteps(input.run, input.workflow)
  const failed =
    input.run.status === "failed" ||
    steps.some((stage) => stage.status === "failed")
  const complete = steps.every((stage) => stage.status === "done")

  return {
    id: input.run.id,
    workflowName: input.workflow.name,
    status: failed ? "failed" : complete ? "succeeded" : "running",
    startedAt:
      input.run.createdAt ||
      input.run.scheduledFor ||
      input.run.updatedAt ||
      "",
    completedAt:
      complete || failed ? input.run.updatedAt || undefined : undefined,
    stages: steps.map((step) => ({
      id: step.name,
      shortLabel: shortStageLabel(step.name),
      title: step.label,
      description: step.description,
      kind: stageKind(step.name),
      status: inspectorStageStatus(step.status),
      input: {
        kind: inputArtifactKind(step.name),
        value: step.input,
      },
      result: step.output
        ? {
            kind: resultArtifactKind(step.name),
            value: step.output,
          }
        : undefined,
      rawInput: step.input,
      rawResult: {
        checkpoint: step.rawOutput,
        assetPaths: step.assetPaths,
        ...(step.name === "publish"
          ? {
              actualCost: input.actual,
              estimatedCost: input.estimate,
              runError: input.run.error,
            }
          : {}),
      },
      canRun: false,
      runDisabledReason:
        "This historical UGC stage does not have a persisted fork boundary.",
    })),
  }
}

function shortStageLabel(stage: UgcStageName) {
  const labels: Record<UgcStageName, string> = {
    analysis: "Analyze",
    script: "Script",
    actor: "Actor",
    voice: "Voice",
    motion: "Animate",
    lipsync: "Lip sync",
    broll: "B-roll",
    composite: "Assemble",
    store: "Store",
    publish: "Publish",
  }
  return labels[stage]
}

function stageKind(stage: UgcStageName) {
  if (
    ["analysis", "script", "voice", "motion", "lipsync", "broll"].includes(
      stage
    )
  ) {
    return "provider"
  }
  if (["store", "publish"].includes(stage)) return "storage"
  return "deterministic"
}

function inspectorStageStatus(
  status: UgcDisplayStageStatus
): WorkflowStageStatus {
  if (status === "done") return "succeeded"
  if (status === "active") return "running"
  return status
}

function inputArtifactKind(stage: UgcStageName): WorkflowArtifactKind {
  if (stage === "script") return "metadata"
  if (["motion", "lipsync", "composite", "store", "publish"].includes(stage)) {
    return "manifest"
  }
  return "metadata"
}

function resultArtifactKind(stage: UgcStageName): WorkflowArtifactKind {
  if (stage === "script") return "copy"
  if (["actor", "motion", "lipsync", "broll"].includes(stage)) {
    return "media-gallery"
  }
  if (stage === "composite" || stage === "publish") return "final"
  if (stage === "voice" || stage === "store") return "manifest"
  return "metadata"
}

function stageInput(
  stage: UgcStageName,
  run: UgcRunStatus,
  workflow: UgcWorkflowContext
) {
  const config = workflow.config
  const checkpoints = run.checkpoints
  const analysis = nested(checkpoints.analysis, "analysis")
  const plan = nested(checkpoints.script, "plan")
  const actor = record(checkpoints.actor)
  const voice = record(checkpoints.voice)
  const motion = record(checkpoints.motion)
  const lipsync = record(checkpoints.lipsync)
  const broll = record(checkpoints.broll)
  const composite = record(checkpoints.composite)
  const stored = record(checkpoints.store)

  switch (stage) {
    case "analysis":
      return compact({
        automationId: run.automationId,
        scheduledFor: run.scheduledFor,
        productUrl: config.productUrl,
        productBrief: config.productBrief,
      })
    case "script":
      return compact({
        productAnalysis: analysis,
        targetDurationSeconds: config.targetDurationSeconds,
      })
    case "actor":
      return compact({
        actorSource: config.actorSource,
        actorAssetUrl: config.actorAssetUrl,
        actorPrompt: config.actorPrompt,
        productAnalysis: analysis,
      })
    case "voice":
      return compact({
        scriptPlan: plan,
        voiceId: config.voiceId,
        voiceModel: config.voiceModel || "eleven_multilingual_v2",
      })
    case "motion":
      return compact({
        actorImage: actor.storagePath,
        direction:
          "Natural handheld UGC delivery, subtle head and hand movement, direct eye contact",
      })
    case "lipsync":
      return compact({
        actorVideo: motion.storagePath,
        voiceAudio: voice.audioPath,
        tier: config.lipSyncTier,
      })
    case "broll":
      return compact({
        scriptSegments: nested(plan, "segments"),
        requestedImages: config.brollCount,
      })
    case "composite":
      return compact({
        actorVideo: lipsync.storagePath,
        voiceAudio: voice.audioPath,
        wordTimings: voice.timingsPath,
        broll: broll.assets,
        captions: config.captions,
        hookOverlay: config.hookOverlay,
      })
    case "store":
      return compact({
        scriptPlan: plan,
        video: composite.videoPath,
        thumbnail: composite.thumbnailPath,
      })
    case "publish":
      return compact({
        outputId: stored.outputId,
        postingMode: workflow.postingMode,
        providers: workflow.socialProviders,
      })
  }
}

function stageOutput(stage: UgcStageName, value: unknown) {
  const output = record(value)
  if (!Object.keys(output).length) return null
  switch (stage) {
    case "analysis":
      return output.analysis ?? output
    case "script":
      return output.plan ?? output
    case "actor":
    case "motion":
    case "lipsync":
      return compact({
        storagePath: output.storagePath,
        contentType: output.contentType,
        provider: output.provider,
        model: output.model,
        requestId: output.requestId,
      })
    case "voice":
      return compact({
        audioPath: output.audioPath,
        timingsPath: output.timingsPath,
        durationMs: output.durationMs,
        wordCount: Array.isArray(output.words)
          ? output.words.length
          : undefined,
      })
    case "broll":
      return compact({
        assets: output.assets,
        assetCount: Array.isArray(output.assets)
          ? output.assets.length
          : undefined,
      })
    case "composite":
      return compact({
        videoPath: output.videoPath,
        thumbnailPath: output.thumbnailPath,
        captionMode: output.captionMode,
        requestId: output.requestId,
      })
    case "store":
      return compact({
        outputId: output.outputId,
        outputRowId: output.outputRowId,
        storagePaths: output.storagePaths,
      })
    case "publish":
      return output
  }
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  )
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nested(value: unknown, key: string): unknown {
  return record(value)[key]
}
