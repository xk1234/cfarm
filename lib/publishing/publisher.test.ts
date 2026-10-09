import { describe, expect, it } from "vitest"

import {
  getPublisher,
  isPublisherConfigured,
  NotConfiguredPublisher,
  PUBLISHER_NOT_CONNECTED_MESSAGE,
  PublisherNotConfiguredError,
  toSocialBuDateTime,
} from "./publisher"
import { SocialBuPublisher } from "./socialbu"

describe("publisher", () => {
  it("degrades to a not-configured publisher without a token", async () => {
    const publisher = getPublisher({})
    expect(publisher).toBeInstanceOf(NotConfiguredPublisher)
    expect(publisher.configured).toBe(false)
    expect(publisher.status()).toEqual({ configured: false, message: PUBLISHER_NOT_CONNECTED_MESSAGE })
    expect(isPublisherConfigured({ SOCIALBU_API_TOKEN: "  " })).toBe(false)
    await expect(publisher.listAccounts()).rejects.toBeInstanceOf(PublisherNotConfiguredError)
    await expect(
      publisher.createPost({ accounts: ["1"], caption: "c", media: [] })
    ).rejects.toThrow(PUBLISHER_NOT_CONNECTED_MESSAGE)
  })

  it("selects the SocialBu client when a token is set", () => {
    const publisher = getPublisher({ SOCIALBU_API_TOKEN: "t" })
    expect(publisher).toBeInstanceOf(SocialBuPublisher)
    expect(publisher.configured).toBe(true)
    expect(publisher.status()).toEqual({ configured: true, provider: "socialbu" })
  })

  it("formats publish_at as UTC Y-m-d H:i:s", () => {
    expect(toSocialBuDateTime("2026-10-09T15:30:00+08:00")).toBe("2026-10-09 07:30:00")
  })
})
