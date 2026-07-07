import { describe, expect, it } from "vitest"

import {
  createPostFastPostPayload,
  normalizePostFastConnectUrl,
  normalizePostFastIntegration,
  PostFastApiError,
  PostFastConfigError,
  postfastRequest,
} from "@/lib/postfast-client"
import { defaultPostFastProviderControls } from "@/lib/postfast-provider-controls"

describe("postfastRequest", () => {
  it("uses the configured base url and POSTFAST_API_KEY as pf-api-key", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json([{ id: "account-1", platform: "TIKTOK" }])
    }

    const data = await postfastRequest("/social-media/my-social-accounts", {
      apiKey: "pf_key_123",
      baseUrl: "https://postfast.example.com/",
      fetcher,
    })

    expect(data).toEqual([{ id: "account-1", platform: "TIKTOK" }])
    expect(calls[0]?.url).toBe(
      "https://postfast.example.com/social-media/my-social-accounts"
    )
    expect(calls[0]?.init.headers).toMatchObject({
      "pf-api-key": "pf_key_123",
    })
  })

  it("throws a setup error when POSTFAST_API_KEY is missing", async () => {
    await expect(
      postfastRequest("/social-media/my-social-accounts", {
        apiKey: "",
        fetcher: fetch,
      })
    ).rejects.toBeInstanceOf(PostFastConfigError)
  })

  it("normalizes retryable api errors", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
      })

    await expect(
      postfastRequest("/social-posts", { apiKey: "pf_key_123", fetcher })
    ).rejects.toMatchObject({
      name: "PostFastApiError",
      status: 429,
      code: "rate_limited",
      retryable: true,
    } satisfies Partial<PostFastApiError>)
  })
})

describe("createPostFastPostPayload", () => {
  it("maps scheduled media posts to PostFast social-posts payload", () => {
    const payload = createPostFastPostPayload({
      type: "schedule",
      date: "2026-07-04T12:00:00.000Z",
      integrationId: "account-1",
      provider: "tiktok",
      content: "Launch clip",
      media: [{ key: "video/uploaded.mp4", type: "VIDEO" }],
      controls: defaultPostFastProviderControls("tiktok", {
        tiktokTitle: "Launch clip",
      }),
    })

    expect(payload).toEqual({
      status: "SCHEDULED",
      posts: [
        {
          content: "Launch clip",
          scheduledAt: "2026-07-04T12:00:00.000Z",
          socialMediaId: "account-1",
          status: "SCHEDULED",
          mediaItems: [
            { key: "video/uploaded.mp4", type: "VIDEO", sortOrder: 0 },
          ],
        },
      ],
      controls: expect.objectContaining({
        tiktokTitle: "Launch clip",
        tiktokAllowComments: true,
      }),
    })
  })

  it("omits empty optional controls before calling PostFast", () => {
    const payload = createPostFastPostPayload({
      integrationId: "account-1",
      provider: "x",
      content: "Launch clip",
      controls: {
        xRetweetUrl: "",
        tags: ["", " launch "],
      },
    })

    expect(payload).toEqual({
      status: "DRAFT",
      posts: [
        {
          content: "Launch clip",
          socialMediaId: "account-1",
          status: "DRAFT",
        },
      ],
      controls: {
        tags: ["launch"],
      },
    })
  })
})

describe("PostFast integration helpers", () => {
  it("normalizes connect-link responses to a url field", () => {
    expect(
      normalizePostFastConnectUrl({
        connectUrl: "https://app.postfa.st/connect?token=abc",
      })
    ).toBe("https://app.postfa.st/connect?token=abc")
  })

  it("normalizes supported social accounts from PostFast responses", () => {
    expect(
      normalizePostFastIntegration({
        id: "yt-1",
        platform: "YOUTUBE",
        displayName: "Brand Channel",
        platformUsername: "brand",
        connectionStatus: "CONNECTED",
      })
    ).toEqual({
      provider: "youtube",
      integration_id: "yt-1",
      name: "Brand Channel",
      profile: "brand",
      disabled: false,
    })

    expect(
      normalizePostFastIntegration({
        id: "fb-1",
        platform: "FACEBOOK",
        displayName: "Brand Page",
        connectionStatus: "DISABLED",
      })
    ).toMatchObject({
      provider: "facebook",
      disabled: true,
    })

    expect(
      normalizePostFastIntegration({
        id: "tt-creative-1",
        platform: "TIKTOK_CREATIVE",
        displayName: "Creative Center",
      })
    ).toMatchObject({
      provider: "tiktok-creative",
      name: "Creative Center",
    })

    expect(
      normalizePostFastIntegration({
        id: "google-1",
        platform: "GOOGLE",
        displayName: "Search Ads",
      })
    ).toMatchObject({
      provider: "google",
      name: "Search Ads",
    })

    expect(
      normalizePostFastIntegration({
        id: "twitter-1",
        platform: "TWITTER",
        displayName: "Brand X",
      })
    ).toMatchObject({
      provider: "twitter",
      name: "Brand X",
    })
  })
})
