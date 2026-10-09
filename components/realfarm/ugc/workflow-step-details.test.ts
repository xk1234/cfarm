import { describe, expect, it } from "vitest"

import { ugcStageOrder } from "@/lib/ugc-automation-runner"
import type { UgcRunStatus } from "@/lib/ugc-run-status"
import {
  buildUgcInspectorRun,
  buildUgcWorkflowSteps,
  suggestedUgcStageIndex,
  type UgcWorkflowContext,
} from "./workflow-step-details"

const workflow: UgcWorkflowContext = {
  name: "Product demo",
  postingMode: "review",
  socialProviders: ["tiktok"],
  config: {
    enabled: true,
    productUrl: "https://example.com/product",
    actorSource: "generate",
    actorPrompt: "A creator at a desk",
    voiceId: "voice-1",
    voiceModel: "eleven_multilingual_v2",
    lipSyncTier: "standard",
    targetDurationSeconds: 30,
    brollCount: 3,
    captions: { enabled: true, style: "karaoke", fallback: "drawtext" },
    hookOverlay: { enabled: true, durationMs: 3000, style: "bold" },
  },
}

const run: UgcRunStatus = {
  id: "run-1",
  automationId: "automation-1",
  scheduledFor: "2026-08-03T00:00:00.000Z",
  status: "voice",
  error: null,
  checkpoints: {
    analysis: {
      analysis: {
        product: "Analytics app",
        audience: "Small product teams",
      },
    },
    script: {
      plan: {
        hook: "Your reports should not take all morning",
        segments: [{ spokenText: "Open the dashboard." }],
      },
    },
    voice: {
      audioPath: "ugc_avatar_videos/run-1/voice.mp3",
      timingsPath: "ugc_avatar_videos/run-1/timings.json",
      words: [{ text: "Open" }, { text: "dashboard" }],
    },
  },
  stages: ugcStageOrder.map((name) => ({
    name,
    status:
      name === "analysis" || name === "script"
        ? "done"
        : name === "actor"
          ? "active"
          : "pending",
    assetPaths: [],
  })),
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:01:00.000Z",
}

describe("UGC workflow step details", () => {
  it("builds real stage inputs from config and preceding checkpoints", () => {
    const steps = buildUgcWorkflowSteps(run, workflow)

    expect(steps[0].input).toMatchObject({
      automationId: "automation-1",
      productUrl: "https://example.com/product",
    })
    expect(steps[1].input).toMatchObject({
      productAnalysis: { product: "Analytics app" },
      targetDurationSeconds: 30,
    })
    expect(steps[2].input).toMatchObject({
      actorSource: "generate",
      actorPrompt: "A creator at a desk",
    })
  })

  it("selects the active stage and keeps large raw output behind the summary", () => {
    const steps = buildUgcWorkflowSteps(run, workflow)
    const voice = steps.find((step) => step.name === "voice")!

    expect(suggestedUgcStageIndex(steps)).toBe(2)
    expect(voice.output).toMatchObject({
      audioPath: "ugc_avatar_videos/run-1/voice.mp3",
      wordCount: 2,
    })
    expect(voice.output).not.toHaveProperty("words")
    expect(voice.rawOutput).toHaveProperty("words")
  })

  it("maps the run to the shared labeled-dot inspector stages", () => {
    const inspector = buildUgcInspectorRun({
      run,
      workflow,
      estimate: { currency: "USD", tier: "lowcost", items: [], totalUsd: 1 },
      actual: { currency: "USD", tier: "lowcost", items: [], totalUsd: 0.5 },
    })

    expect(inspector.status).toBe("running")
    expect(inspector.stages).toHaveLength(ugcStageOrder.length)
    expect(inspector.stages[1]).toMatchObject({
      shortLabel: "Script",
      result: { kind: "copy" },
    })
    expect(inspector.stages[2]).toMatchObject({
      shortLabel: "Actor",
      status: "running",
    })
  })
})
