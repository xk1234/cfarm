import { describe, expect, it } from "vitest"

import {
  mapSocialBuIntegration,
  normalizeSocialBuSocialIntegration,
  normalizeSocialBuSocialIntegrations,
  socialBuSocialAdapter,
} from "@/lib/social/socialbu-adapter"

describe("SocialBu social adapter", () => {
  it("maps a raw SocialBu account to the neutral integration shape", () => {
    expect(
      normalizeSocialBuSocialIntegration({
        account_id: 123,
        account_type: "instagram.business",
        account_name: "LumenClip",
        username: "lumenclip",
        picture: "https://example.com/avatar.jpg",
        active: false,
        socialBuOnlyField: "does not cross the boundary",
      })
    ).toEqual({
      provider: "instagram",
      integration_id: "123",
      name: "LumenClip",
      profile: "lumenclip",
      picture: "https://example.com/avatar.jpg",
      disabled: true,
    })
  })

  it("drops malformed accounts while normalizing account discovery", () => {
    expect(
      normalizeSocialBuSocialIntegrations([
        { account_id: 1, account_type: "youtube.channel", account_name: "Ch" },
        { account_type: "mastodon.profile" },
        null,
      ])
    ).toEqual([
      {
        provider: "youtube",
        integration_id: "1",
        name: "Ch",
        profile: undefined,
        picture: undefined,
        disabled: false,
      },
    ])
  })

  it("copies normalized SocialBu values at the adapter boundary", () => {
    const integration = {
      provider: "x" as const,
      integration_id: "9",
      name: "LumenClip on X",
    }
    const neutral = mapSocialBuIntegration(integration)

    expect(socialBuSocialAdapter.id).toBe("socialbu")
    expect(neutral).toEqual({
      ...integration,
      profile: undefined,
      picture: undefined,
      disabled: undefined,
    })
    expect(neutral).not.toBe(integration)
  })
})
