import { describe, expect, it } from "vitest"

import {
  mapPostFastIntegration,
  normalizePostFastSocialIntegration,
  normalizePostFastSocialIntegrations,
  postFastSocialAdapter,
} from "@/lib/social/postfast-adapter"

describe("PostFast social adapter", () => {
  it("maps a raw PostFast payload to the neutral integration shape", () => {
    expect(
      normalizePostFastSocialIntegration({
        id: "integration-123",
        platform: "INSTAGRAM",
        displayName: "LumenClip",
        platformUsername: "@lumenclip",
        picture: "https://example.com/avatar.jpg",
        connectionStatus: "DISABLED",
        postfastOnlyField: "does not cross the boundary",
      })
    ).toEqual({
      provider: "instagram",
      integration_id: "integration-123",
      name: "LumenClip",
      profile: "@lumenclip",
      picture: "https://example.com/avatar.jpg",
      disabled: true,
    })
  })

  it("drops malformed integrations while normalizing account discovery", () => {
    expect(
      normalizePostFastSocialIntegrations([
        { id: "youtube-1", providerIdentifier: "youtube", name: "Channel" },
        { id: "missing-provider" },
        null,
      ])
    ).toEqual([
      {
        provider: "youtube",
        integration_id: "youtube-1",
        name: "Channel",
        profile: undefined,
        picture: undefined,
        disabled: false,
      },
    ])
  })

  it("copies normalized PostFast values at the adapter boundary", () => {
    const postFastIntegration = {
      provider: "x" as const,
      integration_id: "x-1",
      name: "LumenClip on X",
    }
    const neutral = mapPostFastIntegration(postFastIntegration)

    expect(postFastSocialAdapter.id).toBe("postfast")
    expect(neutral).toEqual({
      ...postFastIntegration,
      profile: undefined,
      picture: undefined,
      disabled: undefined,
    })
    expect(neutral).not.toBe(postFastIntegration)
  })
})
