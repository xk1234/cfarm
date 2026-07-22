import { describe, expect, it, vi } from "vitest"

import {
  ugcExportId,
  ugcRunId,
  runUgcAutomation,
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

  it("skips a paid stage only when its checkpoint asset still exists", async () => {
    const analyze = vi.fn().mockResolvedValue({ product: "Lamp" })
    const script = vi.fn().mockResolvedValue({
      hook: "Look",
      segments: [],
      caption: "Lamp",
      hashtags: [],
    })
    const result = await runUgcAutomation({
      automationId: "auto-1",
      ownerId: "owner-1",
      scheduledFor: "2026-07-22T01:00:00.000Z",
      automation: { status: "live", schema: { status: "live", ugc: { enabled: true } } },
      checkpoints: { actor: { storagePath: "ugc_avatar_videos/x/actor.png" } },
      assetExists: vi.fn().mockResolvedValue(true),
      stages: { analyze, script },
      stopAfter: "script",
    })
    expect(result.checkpoints.actor).toBeDefined()
    expect(analyze).toHaveBeenCalledOnce()
    expect(script).toHaveBeenCalledOnce()
  })
})
