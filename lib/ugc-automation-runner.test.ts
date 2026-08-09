import { describe, expect, it } from "vitest"

import {
  runUgcAutomation,
  ugcExportId,
  ugcRunId,
} from "@/lib/ugc-automation-runner"

describe("UGC automation identity and resume", () => {
  it("uses stable Appwrite-safe ids", () => {
    expect(ugcRunId("auto-1", "2026-07-22T01:00:00.000Z")).toMatch(
      /^ugcrun[a-f0-9]{29}$/
    )
    expect(ugcExportId("auto-1", "2026-07-22T01:00:00.000Z")).toMatch(
      /^ugc-[a-f0-9]{32}$/
    )
  })

  it("executes only the requested component with supplied dependency checkpoints", async () => {
    const voice = async () => ({ audioPath: "voice.mp3" })
    const result = await runUgcAutomation({
      automationId: "standalone-debug",
      ownerId: "owner-1",
      scheduledFor: "2026-07-22T01:00:00.000Z",
      automation: {
        status: "live",
        schema: { status: "live", ugc: { enabled: true } },
      },
      checkpoints: { script: { plan: { hook: "Existing script" } } },
      onlyStages: ["voice"],
      stages: { voice },
    })

    expect(result.checkpoints).toEqual({
      script: { plan: { hook: "Existing script" } },
      voice: { audioPath: "voice.mp3" },
    })
  })
})
