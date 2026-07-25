import { describe, expect, it } from "vitest"

import { ugcExportId, ugcRunId } from "@/lib/ugc-automation-runner"

describe("UGC automation identity and resume", () => {
  it("uses stable Appwrite-safe ids", () => {
    expect(ugcRunId("auto-1", "2026-07-22T01:00:00.000Z")).toMatch(
      /^ugcrun[a-f0-9]{29}$/
    )
    expect(ugcExportId("auto-1", "2026-07-22T01:00:00.000Z")).toMatch(
      /^ugc-[a-f0-9]{32}$/
    )
  })
})
