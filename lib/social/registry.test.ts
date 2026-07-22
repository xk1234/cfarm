import { describe, expect, it } from "vitest"

import type { SocialPlatformKey } from "@/lib/social/provider-contract"
import {
  getPublishableProviders,
  getSocialProvider,
  listSocialProviders,
  socialProviders,
} from "@/lib/social/registry"

const knownPlatforms: SocialPlatformKey[] = [
  "tiktok",
  "tiktok-creative",
  "tiktok-seller",
  "youtube",
  "instagram",
  "facebook",
  "x",
  "twitter",
  "linkedin",
  "threads",
  "pinterest",
  "bluesky",
  "telegram",
  "google",
  "google-business-profile",
]

describe("social provider registry", () => {
  it("contains complete, unique metadata for every known platform", () => {
    expect(socialProviders.map((provider) => provider.platformKey)).toEqual(
      knownPlatforms
    )
    expect(new Set(socialProviders.map((provider) => provider.id)).size).toBe(
      socialProviders.length
    )

    for (const provider of socialProviders) {
      expect(provider.id).toBeTruthy()
      expect(provider.name).toBeTruthy()
      expect(provider.previewKind).toBeTruthy()
      expect(provider.capabilities.mediaKinds.length).toBeGreaterThan(0)
      expect(provider.limits.maxTextLength).toBeGreaterThan(0)
      expect(provider.limits.maxMediaCount).toBeGreaterThan(0)
      expect(provider.limits.image).toBeDefined()
      expect(provider.limits.video).toBeDefined()
    }
  })

  it("looks providers up by platform without exposing the registry array", () => {
    expect(getSocialProvider("instagram")?.name).toBe("Instagram")
    expect(getSocialProvider("not-a-platform")).toBeUndefined()

    const listed = listSocialProviders()
    listed.pop()
    expect(socialProviders).toHaveLength(knownPlatforms.length)
  })

  it("lists only providers with live publishing capability", () => {
    expect(getPublishableProviders()).toEqual(
      socialProviders.filter((provider) => provider.capabilities.canPublish)
    )
  })
})
