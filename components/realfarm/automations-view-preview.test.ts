import { describe, expect, it } from "vitest"

import {
  automationAccountStatusItems,
  automationAccountSummary,
} from "@/components/realfarm/automations-view"

describe("template grid metadata", () => {
  it("shows normalized account details without integration records", () => {
    expect(
      automationAccountSummary({
        id: "template-1",
        name: "Workout",
        status: "live",
        account: "YXK",
        handle: "YouTube · @YXK",
        times: ["11:00 AM"],
        favorite: false,
        theme: "ugc",
        socialIntegrations: [],
      })
    ).toEqual({
      account: "YXK",
      handle: "YouTube · @YXK",
      hasAccount: true,
    })
  })

  it("maps selected social accounts into status items", () => {
    expect(
      automationAccountStatusItems({
        id: "template-1",
        name: "Workout",
        status: "live",
        account: "YXK",
        handle: "YouTube · @YXK",
        times: ["11:00 AM"],
        favorite: false,
        theme: "ugc",
        socialIntegrations: [
          {
            provider: "youtube",
            integration_id: "youtube-1",
            name: "Main YouTube",
            profile: "@yxk",
          },
          {
            provider: "instagram",
            integration_id: "instagram-1",
            name: "IG",
            disabled: true,
          },
        ],
      })
    ).toEqual([
      {
        provider: "youtube",
        integrationId: "youtube-1",
        name: "Main YouTube",
        profile: "@yxk",
        status: "connected",
      },
      {
        provider: "instagram",
        integrationId: "instagram-1",
        name: "IG",
        profile: undefined,
        status: "disabled",
      },
    ])
  })
})
