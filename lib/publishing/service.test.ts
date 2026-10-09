import { beforeEach, describe, expect, it } from "vitest"

import { createMemoryRepositories, type Repositories } from "@/lib/data"
import type { ResolvedSpec } from "@/lib/render/spec"

import { NotConfiguredPublisher, PUBLISHER_NOT_CONNECTED_MESSAGE, type Publisher } from "./publisher"
import {
  cancelPost,
  listPublishingAccounts,
  publishRender,
  PublishingInputError,
  reschedulePost,
  retryPost,
  runPublishPostJob,
  setAccountDisabled,
  type PublishingDeps,
} from "./service"
import { SocialBuPublisher } from "./socialbu"
import { createSocialBuMock, MOCK_BASE_URL, type SocialBuMock } from "./testing"

const WS = "user_123"
let clock: Date
let repos: Repositories
let mock: SocialBuMock
let publisher: Publisher
let deps: PublishingDeps

const now = () => clock

beforeEach(() => {
  clock = new Date("2026-10-09T12:00:00.000Z")
  repos = createMemoryRepositories({ now })
  mock = createSocialBuMock()
  publisher = new SocialBuPublisher({
    now,
    token: "test-token",
    baseUrl: MOCK_BASE_URL,
    fetch: mock.fetch,
    sleep: async () => undefined,
    uploadPollIntervalMs: 0,
  })
  deps = { repos, publisher, now, env: {} }
})

async function seedRender(slides = 3, workspaceId = WS) {
  const spec = {
    canvas: { width: 1080, height: 1920 },
    slides: Array.from({ length: slides }, (_, i) => ({ id: `s${i}` })),
  } as unknown as ResolvedSpec
  const { value: render } = await repos.renders.create(workspaceId, {
    spec,
    source: "ui",
    title: "Five tips",
    createdBy: workspaceId,
  })
  const output = []
  for (let i = 0; i < slides; i++) {
    const fileId = `${render.id}-${String(i).padStart(2, "0")}`
    await repos.blobs.put(workspaceId, "renders", fileId, new Uint8Array([137, 80, 78, 71, i]), "image/png")
    output.push({ index: i, slideId: `s${i}`, fileId, mime: "image/png", sizeBytes: 5, width: 1080, height: 1920 })
  }
  return repos.renders.markSucceeded(workspaceId, render.id, { slides: output, coverFileId: output[0]!.fileId })
}

async function jobs() {
  return (await repos.jobs.listForWorkspace(WS)).items
}

describe("publishing service", () => {
  it("degrades when SocialBu is not configured", async () => {
    const render = await seedRender()
    const notConfigured = { ...deps, publisher: new NotConfiguredPublisher() }
    expect(await listPublishingAccounts(WS, notConfigured)).toEqual({
      status: { configured: false, message: PUBLISHER_NOT_CONNECTED_MESSAGE },
      accounts: [],
    })
    await expect(
      publishRender(WS, { renderId: render.id, accountIds: ["101"], caption: "x", createdBy: WS }, notConfigured)
    ).rejects.toThrow(PUBLISHER_NOT_CONNECTED_MESSAGE)
    expect(await repos.posts.listByRender(WS, render.id)).toEqual([])
  })

  it("publishes a render now as a carousel: uploads every slide in order, stores the post", async () => {
    const render = await seedRender(3)
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["101"], caption: "Five tips #tips", createdBy: WS },
      deps
    )

    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      renderId: render.id,
      provider: "tiktok",
      accountId: "101",
      status: "publishing",
      providerPostId: "9001",
      publishAt: clock.toISOString(),
      platformOptions: { privacy_status: "PUBLIC_TO_EVERYONE" },
      error: null,
    })
    expect(mock.callsTo("POST", "/upload_media").map((call) => (call.body as { name: string }).name)).toEqual([
      `${render.id}-01.png`,
      `${render.id}-02.png`,
      `${render.id}-03.png`,
    ])
    const body = mock.callsTo("POST", "/posts")[0]!.body as Record<string, unknown>
    expect(body).toMatchObject({
      accounts: [101],
      content: "Five tips #tips",
      publish_at: "2026-10-09 12:00:00",
      existing_attachments: [
        { upload_token: "token-key-1" },
        { upload_token: "token-key-2" },
        { upload_token: "token-key-3" },
      ],
      options: { privacy_status: "PUBLIC_TO_EVERYONE" },
    })
    expect(body.postback_url).toBeUndefined()
    // A status sync is queued two minutes out.
    expect(await jobs()).toEqual([
      expect.objectContaining({ type: "publish-post", payload: { postId: posts[0]!.id }, runAt: "2026-10-09T12:02:00.000Z" }),
    ])
  })

  it("is idempotent per request key", async () => {
    const render = await seedRender(1)
    const input = { renderId: render.id, accountIds: ["202"], caption: "c", createdBy: WS, idempotencyKey: "dialog-1" }
    const first = await publishRender(WS, input, deps)
    const second = await publishRender(WS, input, deps)
    expect(second.posts[0]!.id).toBe(first.posts[0]!.id)
    expect(mock.callsTo("POST", "/posts")).toHaveLength(1)
  })

  it("schedules a post with publish_at, a postback URL and an upcoming reminder", async () => {
    const render = await seedRender(2)
    const publishAt = "2026-10-10T09:00:00.000Z"
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["202"], caption: "Later", publishAt, createdBy: WS },
      { ...deps, env: { BASE_URL: "https://app.lumenclip.test", SOCIALBU_POSTBACK_SECRET: "s3cret" } }
    )
    expect(posts[0]).toMatchObject({ status: "scheduled", publishAt, provider: "instagram" })
    const body = mock.callsTo("POST", "/posts")[0]!.body as Record<string, unknown>
    expect(body.publish_at).toBe("2026-10-10 09:00:00")
    expect(body.postback_url).toMatch(/^https:\/\/app\.lumenclip\.test\/api\/publishing\/postback\?w=user_123&p=.+&sig=[0-9a-f]{64}$/)

    const pending = await repos.notifications.listDue("2026-10-10T08:00:00.000Z", 10)
    expect(pending).toEqual([
      expect.objectContaining({ event: "post.upcoming", postId: posts[0]!.id, deliverAt: "2026-10-10T08:00:00.000Z" }),
    ])
    const types = (await jobs()).map((job) => `${job.type}@${job.runAt}`).sort()
    expect(types).toEqual(["notify@2026-10-10T08:00:00.000Z", "publish-post@2026-10-10T09:02:00.000Z"])
  })

  it("validates input before uploading anything", async () => {
    const render = await seedRender(25)
    await expect(
      publishRender(WS, { renderId: render.id, accountIds: ["202"], caption: "c", createdBy: WS }, deps)
    ).rejects.toThrow("at most 20 images")
    await expect(
      publishRender(WS, { renderId: render.id, accountIds: ["303"], caption: "c", createdBy: WS }, deps)
    ).rejects.toThrow("disconnected in SocialBu")
    await expect(
      publishRender(WS, { renderId: "missing", accountIds: ["101"], caption: "c", createdBy: WS }, deps)
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      publishRender(
        WS,
        { renderId: render.id, accountIds: ["101"], caption: "c", publishAt: "2020-01-01T00:00:00Z", createdBy: WS },
        deps
      )
    ).rejects.toThrow("future publish time")
    await expect(
      publishRender(
        WS,
        { renderId: render.id, accountIds: ["101"], caption: "c", createdBy: WS, platformOptions: { tiktok: { privacy_status: "FRIENDS" } } },
        deps
      )
    ).rejects.toThrow('does not allow privacy "FRIENDS"')
    await setAccountDisabled(WS, "101", true, deps)
    await expect(
      publishRender(WS, { renderId: render.id, accountIds: ["101"], caption: "c", createdBy: WS }, deps)
    ).rejects.toBeInstanceOf(PublishingInputError)
    expect(mock.callsTo("POST", "/upload_media")).toHaveLength(0)
  })

  it("marks a rejected post failed and notifies", async () => {
    const render = await seedRender(1)
    mock.fail({
      method: "POST",
      path: "/posts",
      status: 422,
      body: { message: "Invalid", errors: { content: ["Caption is too long."] } },
    })
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["202"], caption: "c", createdBy: WS },
      deps
    )
    expect(posts[0]).toMatchObject({ status: "failed", error: "SocialBu rejected the request: Caption is too long." })
    const inbox = await repos.notifications.list(WS)
    expect(inbox.items).toEqual([expect.objectContaining({ event: "post.failed", status: "delivered" })])
  })

  it("queues a retry when SocialBu is rate limiting, then submits from the job", async () => {
    const render = await seedRender(1)
    mock.fail({ method: "POST", path: "/posts", status: 429, times: 4 })
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["202"], caption: "c", createdBy: WS },
      deps
    )
    expect(posts[0]).toMatchObject({ status: "publishing", providerPostId: null })
    expect(posts[0]!.error).toMatch(/rate limit/)
    const [retry] = await jobs()
    expect(retry).toMatchObject({ type: "publish-post", runAt: "2026-10-09T12:01:00.000Z" })

    clock = new Date("2026-10-09T12:01:00.000Z")
    const result = await runPublishPostJob(retry as never, deps)
    expect(result).toMatchObject({ status: "publishing" })
    expect((await repos.posts.get(WS, posts[0]!.id))!.providerPostId).toBe("9001")
  })

  it("syncs status from SocialBu and notifies when published", async () => {
    const render = await seedRender(1)
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["101"], caption: "c", createdBy: WS },
      deps
    )
    const job = { workspaceId: WS, payload: { postId: posts[0]!.id } }

    clock = new Date("2026-10-09T12:02:00.000Z")
    const pending = await runPublishPostJob(job, deps)
    expect(pending).toMatchObject({ status: "publishing", next: "2026-10-09T12:07:00.000Z" })

    Object.assign(mock.posts.get("9001")!, {
      published: true,
      published_at: "2026-10-09 12:03:10",
      permalink: "https://www.tiktok.com/@creator/photo/1",
    })
    clock = new Date("2026-10-09T12:07:00.000Z")
    expect(await runPublishPostJob(job, deps)).toEqual({ postId: posts[0]!.id, status: "published" })
    expect(await repos.posts.get(WS, posts[0]!.id)).toMatchObject({
      status: "published",
      publishedAt: "2026-10-09T12:03:10.000Z",
      permalink: "https://www.tiktok.com/@creator/photo/1",
    })
    const inbox = await repos.notifications.list(WS)
    expect(inbox.items).toEqual([
      expect.objectContaining({ event: "post.published", title: "Published to TikTok", body: "https://www.tiktok.com/@creator/photo/1" }),
    ])
    // Running again is a no-op.
    expect(await runPublishPostJob(job, deps)).toEqual({ postId: posts[0]!.id, status: "published" })
  })

  it("cancels, reschedules and retries posts", async () => {
    const render = await seedRender(1)
    const publishAt = "2026-10-11T09:00:00.000Z"
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["202"], caption: "c", publishAt, createdBy: WS },
      deps
    )
    const moved = await reschedulePost(WS, posts[0]!.id, "2026-10-12T10:00:00+00:00", deps)
    expect(moved.publishAt).toBe("2026-10-12T10:00:00.000Z")
    expect(mock.callsTo("PATCH", "/posts/9001")[0]!.body).toEqual({ publish_at: "2026-10-12 10:00:00" })

    const canceled = await cancelPost(WS, posts[0]!.id, deps)
    expect(canceled.status).toBe("canceled")
    expect(mock.callsTo("DELETE", "/posts/9001")).toHaveLength(1)
    expect(await repos.notifications.listDue("2030-01-01T00:00:00.000Z", 10)).toEqual([])
    await expect(retryPost(WS, posts[0]!.id, deps)).rejects.toMatchObject({ status: 409 })

    mock.fail({ method: "POST", path: "/posts", status: 422, body: { message: "Media rejected" } })
    const failed = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["101"], caption: "c", createdBy: WS },
      deps
    )
    expect(failed.posts[0]!.status).toBe("failed")
    const retried = await retryPost(WS, failed.posts[0]!.id, deps)
    expect(retried).toMatchObject({ status: "publishing", providerPostId: "9002", error: null })
  })

  it("never touches another workspace's posts", async () => {
    const render = await seedRender(1)
    const { posts } = await publishRender(
      WS,
      { renderId: render.id, accountIds: ["202"], caption: "c", createdBy: WS },
      deps
    )
    await expect(cancelPost("intruder", posts[0]!.id, deps)).rejects.toMatchObject({ status: 404 })
    await expect(
      publishRender("intruder", { renderId: render.id, accountIds: ["202"], caption: "c", createdBy: "intruder" }, deps)
    ).rejects.toMatchObject({ status: 404 })
  })
})
