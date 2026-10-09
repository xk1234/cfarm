import { describe, expect, it } from "vitest"

import { createSocialBuPublisher, PublisherRequestError } from "./publisher"
import { fromSocialBuDateTime, mapSocialBuPost, socialBuProvider } from "./socialbu"
import { createSocialBuMock, MOCK_BASE_URL } from "./testing"

const NOW = new Date("2026-10-09T12:00:00.000Z")

function publisher(mock = createSocialBuMock()) {
  return {
    mock,
    publisher: createSocialBuPublisher({
      token: "test-token",
      baseUrl: MOCK_BASE_URL,
      fetch: mock.fetch,
      sleep: async () => undefined,
      uploadPollIntervalMs: 0,
    }),
  }
}

describe("SocialBu publisher", () => {
  it("maps SocialBu accounts to publisher accounts", async () => {
    const { publisher: p } = publisher()
    const accounts = await p.listAccounts()
    expect(accounts).toEqual([
      {
        id: "101",
        provider: "tiktok",
        name: "TikTok Creator",
        active: true,
        avatarUrl: "https://cdn.socialbu.test/tt.png",
        extra: {
          accountType: "tiktok.profile",
          creator_info: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] },
        },
      },
      {
        id: "202",
        provider: "instagram",
        name: "Insta Brand",
        active: true,
        avatarUrl: null,
        extra: { accountType: "instagram.api" },
      },
      { id: "303", provider: "facebook", name: "Old Page", active: false, avatarUrl: null, extra: { accountType: "facebook.page" } },
    ])
    expect(socialBuProvider("twitter.profile")).toBe("x")
  })

  it("uploads media from bytes (signed URL) and from a URL", async () => {
    const { publisher: p, mock } = publisher()
    const fromBytes = await p.uploadMedia({ name: "s-01.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) })
    expect(fromBytes).toEqual({
      token: "token-key-1",
      name: "s-01.png",
      mime: "image/png",
      sizeBytes: 3,
      previewUrl: "https://cdn.socialbu.test/key-1",
    })
    const fromUrl = await p.uploadMedia({ name: "s-02.png", mime: "image/png", url: "https://files.example/s-02.png" })
    expect(fromUrl.token).toBe("token-key-2")
    expect(mock.callsTo("POST", "/upload_media_by_url")[0]!.body).toEqual({
      url: "https://files.example/s-02.png",
      name: "s-02.png",
    })
  })

  it("creates a TikTok photo carousel with ordered attachments and options", async () => {
    const { publisher: p, mock } = publisher()
    const created = await p.createPost({
      accounts: ["101"],
      caption: "Five tips\n\n#tips",
      media: ["tok-a", "tok-b", "tok-c"],
      publishAt: "2026-10-10T09:30:00+08:00",
      platformOptions: { tiktok: { privacy_status: "PUBLIC_TO_EVERYONE", auto_add_music: true } },
      postbackUrl: "https://app.example/api/publishing/postback?w=u&p=1&sig=x",
    })

    expect(mock.callsTo("POST", "/posts")[0]!.body).toEqual({
      accounts: [101],
      content: "Five tips\n\n#tips",
      publish_at: "2026-10-10 01:30:00",
      existing_attachments: [{ upload_token: "tok-a" }, { upload_token: "tok-b" }, { upload_token: "tok-c" }],
      options: { privacy_status: "PUBLIC_TO_EVERYONE", auto_add_music: true },
      postback_url: "https://app.example/api/publishing/postback?w=u&p=1&sig=x",
    })
    expect(created.posts).toEqual([
      expect.objectContaining({ id: "9001", accountId: "101", publishAt: "2026-10-10T01:30:00.000Z" }),
    ])
  })

  it("schedules with publish_at and publishes now when publishAt is omitted", async () => {
    const mock = createSocialBuMock()
    const p = createSocialBuPublisher({ token: "test-token", baseUrl: MOCK_BASE_URL, fetch: mock.fetch })
    await p.createPost({ accounts: ["202"], caption: "Now", media: ["t"] })
    const body = mock.callsTo("POST", "/posts")[0]!.body as { publish_at: string; options?: unknown }
    expect(body.publish_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(Math.abs(Date.parse(`${body.publish_at.replace(" ", "T")}Z`) - Date.now())).toBeLessThan(5_000)
    expect(body.options).toBeUndefined()
  })

  it("surfaces SocialBu validation errors", async () => {
    const { publisher: p, mock } = publisher()
    mock.fail({
      method: "POST",
      path: "/posts",
      status: 422,
      body: { message: "The given data was invalid.", errors: { content: ["Caption too long for Instagram."] } },
    })
    const error = await p
      .createPost({ accounts: ["202"], caption: "x", media: ["t"] })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PublisherRequestError)
    expect(error).toMatchObject({ status: 422, message: "SocialBu rejected the request: Caption too long for Instagram." })
    await expect(p.createPost({ accounts: ["abc"], caption: "x", media: [] })).rejects.toMatchObject({ status: 400 })
  })

  it("reads, reschedules and deletes posts", async () => {
    const { publisher: p, mock } = publisher()
    const { posts } = await p.createPost({
      accounts: ["202"],
      caption: "Later",
      media: ["t"],
      publishAt: "2099-01-01T00:00:00Z",
    })
    const id = posts[0]!.id
    expect((await p.getPost(id)).status).toBe("scheduled")

    const moved = await p.reschedulePost!(id, "2099-02-01T10:00:00Z")
    expect(mock.callsTo("PATCH", `/posts/${id}`)[0]!.body).toEqual({ publish_at: "2099-02-01 10:00:00" })
    expect(moved.publishAt).toBe("2099-02-01T10:00:00.000Z")

    await p.deletePost!(id)
    await expect(p.getPost(id)).rejects.toMatchObject({ status: 404 })
  })

  it("derives post status from SocialBu post objects", () => {
    expect(mapSocialBuPost({ id: 1, account_id: 2, publish_at: "2026-10-10 00:00:00" }, NOW).status).toBe("scheduled")
    expect(mapSocialBuPost({ id: 1, publish_at: "2026-10-09 11:59:00" }, NOW).status).toBe("publishing")
    expect(
      mapSocialBuPost(
        { id: 1, published: true, published_at: "2026-10-09 11:00:00", permalink: "https://www.tiktok.com/@a/photo/1" },
        NOW
      )
    ).toMatchObject({
      status: "published",
      publishedAt: "2026-10-09T11:00:00.000Z",
      permalink: "https://www.tiktok.com/@a/photo/1",
    })
    expect(
      mapSocialBuPost({ id: 1, publish_at: "2026-10-09 11:00:00", result: { success: false, error: "Token expired" } }, NOW)
    ).toMatchObject({ status: "failed", error: "Token expired" })
    expect(mapSocialBuPost({ id: 1, draft: true }, NOW).status).toBe("draft")
    expect(fromSocialBuDateTime("garbage")).toBeNull()
  })
})
