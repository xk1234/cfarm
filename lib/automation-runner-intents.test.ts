import { describe, expect, it } from "vitest"

import { automationPostIntentOptions } from "@/lib/automation-runner"
import { createLocalAutomationRecord } from "@/lib/automations"

describe("automation-runner post intent creation options", () => {
  it("materializes one ready intent destination per enabled account", () => {
    const automation = createLocalAutomationRecord({
      name: "Intent automation",
    })
    automation.schema.posting_mode = "review"
    automation.schema.social_integrations = [
      {
        integration_id: "account-1",
        provider: "tiktok",
        name: "TikTok",
      },
      {
        integration_id: "account-2",
        provider: "instagram",
        name: "Instagram",
      },
      {
        integration_id: "account-disabled",
        provider: "youtube",
        name: "YouTube",
        disabled: true,
      },
    ]

    expect(automationPostIntentOptions(automation.schema)).toEqual({
      publishMode: "review",
      destinations: [
        { integrationId: "account-1", provider: "tiktok" },
        { integrationId: "account-2", provider: "instagram" },
      ],
    })
  })

  it("leaves destinations empty so output creation emits one unassigned intent", () => {
    const automation = createLocalAutomationRecord({
      name: "Unassigned intent automation",
    })
    automation.schema.social_integrations = []

    expect(automationPostIntentOptions(automation.schema).destinations).toEqual(
      []
    )
  })
})
