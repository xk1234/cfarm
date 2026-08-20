import { describe, expect, it } from "vitest"

import {
  activePublishingAdapter,
  activePublishingProvider,
  defaultPublishingProvider,
} from "@/lib/social/publishing-provider"
import { postFastSocialAdapter } from "@/lib/social/postfast-adapter"
import { socialBuSocialAdapter } from "@/lib/social/socialbu-adapter"

describe("activePublishingProvider", () => {
  it("defaults to PostFast when unset or unrecognized", () => {
    expect(activePublishingProvider(undefined)).toBe("postfast")
    expect(activePublishingProvider("")).toBe("postfast")
    expect(activePublishingProvider("mystery")).toBe(defaultPublishingProvider)
  })

  it("selects SocialBu when explicitly configured (case-insensitive)", () => {
    expect(activePublishingProvider("socialbu")).toBe("socialbu")
    expect(activePublishingProvider("SocialBu")).toBe("socialbu")
  })

  it("selects PostFast when explicitly configured", () => {
    expect(activePublishingProvider("postfast")).toBe("postfast")
  })
})

describe("activePublishingAdapter", () => {
  it("returns the adapter matching the resolved provider", () => {
    expect(activePublishingAdapter("postfast")).toBe(postFastSocialAdapter)
    expect(activePublishingAdapter("socialbu")).toBe(socialBuSocialAdapter)
  })
})
