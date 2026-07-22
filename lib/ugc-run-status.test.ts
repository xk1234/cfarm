import { describe, expect, it } from "vitest"

import { normalizeUgcRunStatus } from "./ugc-run-status"

describe("normalizeUgcRunStatus", () => {
  it("maps durable checkpoints to done and the next stage to active", () => {
    const result = normalizeUgcRunStatus({
      id: "run-1",
      automationId: "automation-1",
      scheduledFor: "2026-07-22T10:00:00.000Z",
      status: "voice",
      checkpoints: {
        analysis: { value: true },
        script: { value: true },
        actor: { storagePath: "data/ugc/avatar.png" },
        voice: {
          storagePaths: ["data/ugc/voice.mp3", "data/ugc/timings.json"],
          audioPath: "data/ugc/voice.mp3",
        },
      },
    })

    expect(result.stages.slice(0, 4).map((stage) => stage.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ])
    expect(result.stages[4]).toMatchObject({ name: "motion", status: "active" })
    expect(result.stages[3].assetPaths).toEqual([
      "data/ugc/voice.mp3",
      "data/ugc/timings.json",
    ])
    expect(result.stages.at(-1)?.status).toBe("pending")
  })

  it("marks the first incomplete stage failed for a failed run", () => {
    const result = normalizeUgcRunStatus({
      id: "run-2",
      automationId: "automation-1",
      status: "failed",
      error: "Provider timeout",
      checkpoints: { analysis: { value: true }, script: { value: true } },
    })

    expect(result.error).toBe("Provider timeout")
    expect(result.stages.find((stage) => stage.name === "actor")?.status).toBe(
      "failed"
    )
    expect(result.stages.find((stage) => stage.name === "motion")?.status).toBe(
      "pending"
    )
  })
})
