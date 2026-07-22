import { describe, expect, it } from "vitest"

import { defaultAutomationSchema, normalizeAutomationSchema, ugcLiveConfigurationErrors } from "@/lib/realfarm-automation"

const automation = { id: "a", name: "UGC", status: "paused" as const, account: "", handle: "", times: [], favorite: false, theme: "ugc", socialIntegrations: [], automationKind: "ugc" as const }

describe("UGC automation schema", () => {
  it("migrates UGC disabled and never converts legacy video", () => {
    const defaults = defaultAutomationSchema(automation)
    const ugc = normalizeAutomationSchema({ ...defaults, automationKind: "ugc" }, automation)
    expect(ugc.ugc?.enabled).toBe(false)
    expect(normalizeAutomationSchema({ ...defaults, automationKind: "video" }, automation).automationKind).toBe("video")
  })

  it("rejects an enabled live UGC config without product input and voice", () => {
    expect(ugcLiveConfigurationErrors({ automationKind: "ugc", status: "live", ugc: { enabled: true } as never })).toHaveLength(2)
  })
})
