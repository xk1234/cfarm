import { describe, expect, it } from "vitest"

import {
  buildSocialBuUrl,
  createSocialBuPostPayload,
  extractSocialBuAccounts,
  formatSocialBuPublishAt,
  normalizeSocialBuConnectUrl,
  normalizeSocialBuIntegration,
  normalizeSocialBuProvider,
  socialBuPostIds,
  socialBuReleaseUrl,
  SocialBuApiError,
  SocialBuConfigError,
  socialbuRequest,
} from "@/lib/socialbu-client"

describe("socialbuRequest", () => {
  it("uses the base url and sends the token as a bearer header", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json([{ account_id: 1, account_type: "tiktok.profile" }])
    }

    const data = await socialbuRequest("/accounts", {
      apiToken: "sb_token_123",
      baseUrl: "https://socialbu.example.com/api/v1/",
      fetcher,
      retry: { minRequestGapMs: 0 },
    })

    expect(data).toEqual([{ account_id: 1, account_type: "tiktok.profile" }])
    expect(calls[0]?.url).toBe("https://socialbu.example.com/api/v1/accounts")
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer sb_token_123",
    })
  })

  it("throws a setup error when SOCIALBU_API_TOKEN is missing", async () => {
    await expect(
      socialbuRequest("/accounts", { apiToken: "", fetcher: fetch })
    ).rejects.toBeInstanceOf(SocialBuConfigError)
  })

  it("retries retryable api errors with bounded exponential backoff", async () => {
    let calls = 0
    const fetcher = async () =>
      ++calls < 3
        ? new Response(JSON.stringify({ message: "Too many requests" }), {
            status: 429,
          })
        : Response.json({ id: 7 })

    await expect(
      socialbuRequest("/posts", {
        apiToken: "sb_token_123",
        fetcher,
        retry: { baseDelayMs: 0, minRequestGapMs: 0 },
      })
    ).resolves.toEqual({ id: 7 })
    expect(calls).toBe(3)
  })

  it("throws the normalized error after the retry limit", async () => {
    let calls = 0
    const fetcher = async () => {
      calls += 1
      return new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
      })
    }

    await expect(
      socialbuRequest("/posts", {
        apiToken: "sb_token_123",
        fetcher,
        retry: { maxAttempts: 2, baseDelayMs: 0, minRequestGapMs: 0 },
      })
    ).rejects.toMatchObject({
      name: "SocialBuApiError",
      status: 429,
      code: "rate_limited",
      retryable: true,
    } satisfies Partial<SocialBuApiError>)
    expect(calls).toBe(2)
  })

  it("flattens 422 validation errors into a single message", async () => {
    await expect(
      socialbuRequest("/posts", {
        apiToken: "sb_token_123",
        fetcher: async () =>
          new Response(
            JSON.stringify({
              message: "The given data was invalid.",
              errors: { publish_at: ["The publish at is required."] },
            }),
            { status: 422 }
          ),
        retry: { minRequestGapMs: 0 },
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "invalid_request",
      message: "The given data was invalid.",
    })
  })

  it("serializes concurrent requests", async () => {
    let active = 0
    let maxActive = 0
    const fetcher = async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return Response.json({ ok: true })
    }

    await Promise.all([
      socialbuRequest("/first", {
        apiToken: "sb_token_123",
        fetcher,
        retry: { minRequestGapMs: 0 },
      }),
      socialbuRequest("/second", {
        apiToken: "sb_token_123",
        fetcher,
        retry: { minRequestGapMs: 0 },
      }),
    ])

    expect(maxActive).toBe(1)
  })
})

describe("formatSocialBuPublishAt", () => {
  it("formats a date as Y-m-d H:i:s in UTC", () => {
    expect(formatSocialBuPublishAt("2026-07-04T12:05:09.000Z")).toBe(
      "2026-07-04 12:05:09"
    )
  })

  it("rejects an invalid publish time", () => {
    expect(() => formatSocialBuPublishAt("not-a-date")).toThrow()
  })
})

describe("createSocialBuPostPayload", () => {
  it("maps a scheduled post with attachments to the SocialBu payload", () => {
    const payload = createSocialBuPostPayload({
      type: "schedule",
      date: "2026-07-04T12:00:00.000Z",
      accountIds: ["1", 2],
      content: "Launch clip",
      attachments: [{ upload_token: "tok_video" }],
      options: { title: "Launch clip", tags: [] },
    })

    expect(payload).toEqual({
      accounts: [1, 2],
      publish_at: "2026-07-04 12:00:00",
      content: "Launch clip",
      existing_attachments: [{ upload_token: "tok_video" }],
      options: { title: "Launch clip" },
    })
  })

  it("marks draft posts and derives a publish time from the injected clock", () => {
    const payload = createSocialBuPostPayload({
      type: "draft",
      accountIds: [5],
      content: "Draft body",
      now: new Date("2026-01-02T03:04:05.000Z"),
    })

    expect(payload).toEqual({
      accounts: [5],
      publish_at: "2026-01-02 03:04:05",
      content: "Draft body",
      draft: true,
    })
  })

  it("requires at least one numeric account id", () => {
    expect(() =>
      createSocialBuPostPayload({ accountIds: ["not-a-number"], content: "x" })
    ).toThrow()
  })
})

describe("SocialBu account/provider helpers", () => {
  it("normalizes connect-link responses to a url field", () => {
    expect(
      normalizeSocialBuConnectUrl({
        connect_url: "https://socialbu.com/connect?token=abc",
      })
    ).toBe("https://socialbu.com/connect?token=abc")
  })

  it("extracts accounts from array, items, and accounts shapes", () => {
    expect(extractSocialBuAccounts([{ account_id: 1 }])).toEqual([
      { account_id: 1 },
    ])
    expect(extractSocialBuAccounts({ items: [{ account_id: 2 }] })).toEqual([
      { account_id: 2 },
    ])
    expect(extractSocialBuAccounts({ accounts: [{ account_id: 3 }] })).toEqual([
      { account_id: 3 },
    ])
    expect(extractSocialBuAccounts({})).toEqual([])
  })

  it("maps dotted account types to neutral provider keys", () => {
    expect(normalizeSocialBuProvider("facebook.page")).toBe("facebook")
    expect(normalizeSocialBuProvider("twitter.profile")).toBe("twitter")
    expect(normalizeSocialBuProvider("google-business-profile")).toBe(
      "google-business-profile"
    )
    expect(normalizeSocialBuProvider("mastodon.profile")).toBeNull()
  })

  it("normalizes a SocialBu account into the neutral integration shape", () => {
    expect(
      normalizeSocialBuIntegration({
        account_id: 42,
        account_type: "instagram.business",
        account_name: "LumenClip",
        username: "lumenclip",
        picture: "https://example.com/avatar.jpg",
        active: false,
      })
    ).toEqual({
      provider: "instagram",
      integration_id: "42",
      name: "LumenClip",
      profile: "lumenclip",
      picture: "https://example.com/avatar.jpg",
      disabled: true,
    })
  })

  it("drops accounts on unsupported networks or missing ids", () => {
    expect(
      normalizeSocialBuIntegration({ account_type: "mastodon.profile" })
    ).toBeNull()
    expect(normalizeSocialBuIntegration({ account_id: 1 })).toBeNull()
  })
})

describe("SocialBu response parsers", () => {
  it("collects post ids from posts arrays and single posts", () => {
    expect(socialBuPostIds({ posts: [{ id: 1 }, { id: 2 }] })).toEqual([
      "1",
      "2",
    ])
    expect(socialBuPostIds({ post: { id: 9 } })).toEqual(["9"])
    expect(socialBuPostIds({ id: 3 })).toEqual(["3"])
    expect(socialBuPostIds({ message: "Successfully saved to queue" })).toEqual(
      []
    )
  })

  it("extracts a release url from common response shapes", () => {
    expect(socialBuReleaseUrl({ posts: [{ url: "https://x.com/p/1" }] })).toBe(
      "https://x.com/p/1"
    )
    expect(socialBuReleaseUrl({ post: { link: "https://t.co/2" } })).toBe(
      "https://t.co/2"
    )
    expect(socialBuReleaseUrl({ message: "queued" })).toBeUndefined()
  })
})

describe("buildSocialBuUrl", () => {
  it("joins base url and path and applies query params", () => {
    expect(
      buildSocialBuUrl("/posts", {
        baseUrl: "https://socialbu.com/api/v1",
        query: { limit: 10, skip: undefined },
      })
    ).toBe("https://socialbu.com/api/v1/posts?limit=10")
  })
})
