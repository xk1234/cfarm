import { describe, expect, it } from "vitest"

import { parseManualPublicationUrl } from "./manual-publication"

describe("parseManualPublicationUrl", () => {
  it("canonicalizes a URL and extracts the provider-native post id", () => {
    expect(
      parseManualPublicationUrl({
        provider: "twitter",
        url: "https://www.x.com/creator/status/12345?utm_source=share#comments",
      })
    ).toEqual({
      provider: "x",
      releaseUrl: "https://www.x.com/creator/status/12345",
      externalPostId: "12345",
    })
  })

  it("rejects private and mismatched URLs", () => {
    expect(() =>
      parseManualPublicationUrl({
        provider: "x",
        url: "http://localhost:3000/post/1",
      })
    ).toThrow(/HTTPS/)
    expect(() =>
      parseManualPublicationUrl({
        provider: "x",
        url: "https://instagram.com/p/ABC/",
      })
    ).toThrow(/does not match/)
  })

  it("supports TikTok photo slideshows as well as videos", () => {
    expect(
      parseManualPublicationUrl({
        provider: "tiktok",
        url: "https://www.tiktok.com/@horoiq/photo/7662360324313517330?is_from_webapp=1",
      })
    ).toEqual({
      provider: "tiktok",
      releaseUrl: "https://www.tiktok.com/@horoiq/photo/7662360324313517330",
      externalPostId: "7662360324313517330",
    })
  })
})
