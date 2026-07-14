import { describe, expect, it } from "vitest"

import {
  defaultAutomationSchema,
  normalizeAutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const automation = {
  id: "automation-web-search",
  name: "Current affairs",
  status: "live",
  account: "LumenClip",
  handle: "@lumenclip",
  times: [],
  automationKind: "slideshow",
  favorite: false,
  theme: "default",
  socialIntegrations: [],
} satisfies Automation

describe("automation web search setting", () => {
  it("is disabled by default", () => {
    expect(defaultAutomationSchema(automation).web_search_enabled).toBe(false)
  })

  it("survives schema normalization when enabled", () => {
    const schema = defaultAutomationSchema(automation)
    expect(
      normalizeAutomationSchema(
        { ...schema, web_search_enabled: true },
        automation
      ).web_search_enabled
    ).toBe(true)
  })
})
