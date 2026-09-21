import { describe, expect, it } from "vitest"

import {
  postFastPublishingClient,
  resolvePublishingClient,
  socialBuPublishingClient,
  type PublishTransport,
} from "@/lib/social/publishing-client"

describe("resolvePublishingClient", () => {
  it("returns the client matching the provider", () => {
    expect(resolvePublishingClient("postfast")).toBe(postFastPublishingClient)
    expect(resolvePublishingClient("socialbu")).toBe(socialBuPublishingClient)
  })
})

describe("postFastPublishingClient", () => {
  it("posts a PostFast social-posts payload and parses ids/url", async () => {
    const calls: { path: string; body?: unknown }[] = []
    const request: PublishTransport = async (path, options) => {
      calls.push({ path, body: options.body })
      return {
        postIds: ["pf-1"],
        posts: [{ releaseUrl: "https://tiktok.com/@x/1" }],
      } as never
    }

    const result = await postFastPublishingClient.createPost({
      type: "now",
      integrationId: "acc-1",
      provider: "tiktok",
      content: "hello",
      media: [{ key: "video/a.mp4", type: "VIDEO" }],
      request,
    })

    expect(calls[0]?.path).toBe("/social-posts")
    expect(calls[0]?.body).toMatchObject({
      posts: [
        {
          socialMediaId: "acc-1",
          content: "hello",
          mediaItems: [{ key: "video/a.mp4", type: "VIDEO", sortOrder: 0 }],
        },
      ],
    })
    expect(result.postIds).toEqual(["pf-1"])
    expect(result.releaseUrl).toBe("https://tiktok.com/@x/1")
  })

  it("deletes a PostFast post by id", async () => {
    const calls: { path: string; method?: string }[] = []
    await postFastPublishingClient.deletePost("pf-9", async (path, options) => {
      calls.push({ path, method: options.method })
      return undefined as never
    })
    expect(calls[0]).toEqual({ path: "/social-posts/pf-9", method: "DELETE" })
  })
})

describe("socialBuPublishingClient", () => {
  it("posts a SocialBu payload with attachments and parses ids/url", async () => {
    const calls: { path: string; body?: unknown }[] = []
    const request: PublishTransport = async (path, options) => {
      calls.push({ path, body: options.body })
      return { post: { id: 55, url: "https://x.com/p/55" } } as never
    }

    const result = await socialBuPublishingClient.createPost({
      type: "schedule",
      date: "2026-07-04T12:00:00.000Z",
      integrationId: "42",
      provider: "instagram",
      content: "hello",
      media: [{ key: "tok_abc", type: "IMAGE" }],
      request,
    })

    expect(calls[0]?.path).toBe("/posts")
    expect(calls[0]?.body).toMatchObject({
      accounts: [42],
      publish_at: "2026-07-04 12:00:00",
      content: "hello",
      existing_attachments: [{ upload_token: "tok_abc" }],
    })
    expect(result.postIds).toEqual(["55"])
    expect(result.releaseUrl).toBe("https://x.com/p/55")
  })

  it("deletes a SocialBu post by id", async () => {
    const calls: { path: string; method?: string }[] = []
    await socialBuPublishingClient.deletePost("55", async (path, options) => {
      calls.push({ path, method: options.method })
      return undefined as never
    })
    expect(calls[0]).toEqual({ path: "/posts/55", method: "DELETE" })
  })
})
