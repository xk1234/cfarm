import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { UgcWorkflowDisplay, type UgcRunResponse } from "./ugc-run-status"

const data: UgcRunResponse = {
  workflow: {
    name: "Product demo workflow",
    postingMode: "review",
    socialProviders: ["tiktok"],
    config: {
      enabled: true,
      productBrief: "A focused analytics tool for small teams.",
      actorSource: "generate",
      voiceId: "voice-1",
      lipSyncTier: "standard",
      targetDurationSeconds: 30,
      brollCount: 2,
      captions: { enabled: true, style: "karaoke", fallback: "drawtext" },
      hookOverlay: { enabled: true, durationMs: 3000, style: "bold" },
    },
  },
  run: {
    id: "run-1",
    automationId: "automation-1",
    scheduledFor: "2026-08-03T00:00:00.000Z",
    status: "script",
    error: null,
    checkpoints: {
      analysis: {
        analysis: {
          product: "Analytics tool",
          audience: "Small teams",
        },
      },
    },
    stages: [
      { name: "analysis", status: "done", assetPaths: [] },
      { name: "script", status: "active", assetPaths: [] },
      { name: "actor", status: "pending", assetPaths: [] },
      { name: "voice", status: "pending", assetPaths: [] },
      { name: "motion", status: "pending", assetPaths: [] },
      { name: "lipsync", status: "pending", assetPaths: [] },
      { name: "broll", status: "pending", assetPaths: [] },
      { name: "composite", status: "pending", assetPaths: [] },
      { name: "store", status: "pending", assetPaths: [] },
      { name: "publish", status: "pending", assetPaths: [] },
    ],
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:01:00.000Z",
  },
  estimate: {
    currency: "USD",
    tier: "lowcost",
    items: [],
    totalUsd: 0.52,
  },
  actual: {
    currency: "USD",
    tier: "lowcost",
    items: [],
    totalUsd: 0.01,
  },
}

describe("UgcWorkflowDisplay", () => {
  it("renders the UGC run through the shared workflow inspector", () => {
    const html = renderToStaticMarkup(<UgcWorkflowDisplay data={data} />)

    expect(html).toContain("Product demo workflow")
    expect(html).toContain("Write script plan")
    expect(html.indexOf(">Input<")).toBeLessThan(html.indexOf(">Result<"))
    expect(html).toContain('aria-label="Workflow stages"')
    expect(html).toContain('aria-current="step"')
    expect(html).toContain("Raw stage data")
    expect(html).toContain("Run workflow")
    expect(html).toContain("Run step")
    expect(html).not.toContain("About this step")
    expect(html).not.toContain("All workflow steps")
    expect(html).not.toContain("Run details and cost")
    expect(html).not.toContain("<pre")
    expect(html).not.toContain("Honest progress &amp; cost")
    expect(html).not.toContain("grid-cols-2")
    expect(html).not.toContain("<details open")
  })
})
