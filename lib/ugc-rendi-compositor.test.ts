import { describe, expect, it } from "vitest"

import { buildUgcFfmpegCommand, buildUgcAss } from "@/lib/ugc-rendi-compositor"

describe("UGC Rendi compositor", () => {
  it("escapes ASS control characters and uses aliases", () => {
    expect(buildUgcAss([{ word: "{sale}\\now", startMs: 0, endMs: 500 }])).not.toContain("{sale}")
    const spec = buildUgcFfmpegCommand({ durationSeconds: 15, hook: "50%: sale", captions: [] })
    expect(spec.command).toContain("actor.mp4")
    expect(spec.command).not.toContain("50%: sale")
  })
})
