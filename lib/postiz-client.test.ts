import { describe, expect, it } from "vitest"

import { createPostizPostPayload, PostizApiError, PostizConfigError, postizRequest } from "@/lib/postiz-client"
import { defaultPostizProviderSettings } from "@/lib/postiz-provider-settings"

describe("postizRequest", () => {
  it("uses the configured base url and server api key", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json([{ id: "integration-1", identifier: "x" }])
    }

    const data = await postizRequest("/integrations", {
      apiKey: "key_123",
      baseUrl: "https://postiz.example.com/api/public/v1/",
      fetcher,
    })

    expect(data).toEqual([{ id: "integration-1", identifier: "x" }])
    expect(calls[0]?.url).toBe("https://postiz.example.com/api/public/v1/integrations")
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "key_123" })
  })

  it("throws a setup error when the api key is missing", async () => {
    await expect(postizRequest("/integrations", { apiKey: "", fetcher: fetch })).rejects.toBeInstanceOf(PostizConfigError)
  })

  it("normalizes retryable api errors", async () => {
    const fetcher = async () => new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 })

    await expect(postizRequest("/posts", { apiKey: "key_123", fetcher })).rejects.toMatchObject({
      name: "PostizApiError",
      status: 429,
      code: "rate_limited",
      retryable: true,
    } satisfies Partial<PostizApiError>)
  })
})

describe("createPostizPostPayload", () => {
  it("defaults to draft posts and maps media into Postiz image entries", () => {
    const payload = createPostizPostPayload({
      integrationId: "integration-1",
      provider: "tiktok",
      content: "Launch clip",
      media: [{ id: "media-1", path: "https://uploads.postiz.com/video.mp4" }],
      settings: defaultPostizProviderSettings("tiktok", { title: "Launch clip" }),
    })

    expect(payload.type).toBe("draft")
    expect(payload.posts[0]?.integration.id).toBe("integration-1")
    expect(payload.posts[0]?.value[0]?.image).toEqual([{ id: "media-1", path: "https://uploads.postiz.com/video.mp4" }])
    expect(payload.posts[0]?.settings).toMatchObject({
      __type: "tiktok",
      title: "Launch clip",
      content_posting_method: "DIRECT_POST",
    })
  })
})
