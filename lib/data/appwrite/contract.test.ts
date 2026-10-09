/**
 * Repository contract tests, run against the in-memory reference backend and
 * the Appwrite adapter wired to an in-process fake of TablesDB/Storage. No
 * network: Appwrite Cloud is never contacted.
 */
import { describe, expect, it } from "vitest"

import { createMemoryRepositories, DataConflictError, DataNotFoundError, looksLikeApiKey, verifyFileToken } from "@/lib/data"
import type { Repositories } from "@/lib/data"
import type { ResolvedSpec, SlideshowSpec } from "@/lib/render/spec"
import quoteTemplate from "@/lib/render/fixtures/quote-carousel.template.json"

import { createFakeAppwrite } from "./fake"
import { createAppwriteRepositories, leaseRowId, storedFileName } from "./repositories"

const WS = "user_alice"
const OTHER = "user_bob"
const resolved: ResolvedSpec = {
  version: 1,
  canvas: { width: 1080, height: 1350, background: "#000000" },
  fonts: [],
  slides: [{ id: "s1", background: "#000000", layers: [] }],
}

function clock(start = "2026-10-09T08:00:00.000Z") {
  let t = new Date(start).getTime()
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) }
}

type Factory = (now?: () => Date) => Repositories

const backends: [string, Factory][] = [
  ["memory", (now) => createMemoryRepositories({ now })],
  [
    "appwrite (fake)",
    (now) => {
      const fake = createFakeAppwrite({ now })
      return createAppwriteRepositories({
        tables: fake.tables,
        storage: fake.storage,
        databaseId: "lumenclip",
        now,
        signedUrls: { baseUrl: "https://app.test", secret: "s3cret" },
      })
    },
  ],
]

describe.each(backends)("repositories: %s", (_name, make) => {
  it("scopes renders to their workspace and pages newest first", async () => {
    const c = clock()
    const repos = make(c.now)
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const { value } = await repos.renders.create(WS, { spec: resolved, source: "ui", createdBy: WS, title: `r${i}` })
      ids.push(value.id)
      c.advance(1000)
    }
    expect(await repos.renders.get(OTHER, ids[0])).toBeNull()
    await expect(repos.renders.markFailed(OTHER, ids[0], "x")).rejects.toBeInstanceOf(DataNotFoundError)
    const done = await repos.renders.markSucceeded(WS, ids[0], {
      slides: [{ index: 0, slideId: "s1", fileId: `${ids[0]}-01`, mime: "image/png", sizeBytes: 3, width: 1080, height: 1350 }],
      coverFileId: `${ids[0]}-01`,
    })
    expect(done.status).toBe("succeeded")
    expect(done.output?.slides).toHaveLength(1)
    expect(done.spec).toEqual(resolved)

    const first = await repos.renders.list(WS, { limit: 2 })
    expect(first.items.map((r) => r.id)).toEqual([ids[2], ids[1]])
    expect(first.items[0]).not.toHaveProperty("spec")
    const second = await repos.renders.list(WS, { limit: 2, cursor: first.nextCursor })
    expect(second.items.map((r) => r.id)).toEqual([ids[0]])
    expect(second.nextCursor).toBeNull()
    expect((await repos.renders.list(OTHER)).items).toEqual([])

    await repos.renders.softDelete(WS, ids[1])
    expect(await repos.renders.get(WS, ids[1])).toBeNull()
    expect((await repos.renders.list(WS)).items).toHaveLength(2)
  })

  it("honours render idempotency keys", async () => {
    const repos = make()
    const a = await repos.renders.create(WS, { spec: resolved, source: "api", idempotencyKey: "k1", createdBy: WS })
    const b = await repos.renders.create(WS, { spec: resolved, source: "api", idempotencyKey: "k1", createdBy: WS })
    expect(b).toEqual({ value: a.value, created: false })
    const c = await repos.renders.create(OTHER, { spec: resolved, source: "api", idempotencyKey: "k1", createdBy: OTHER })
    expect(c.created).toBe(true)
    expect(a.value.id.length).toBeLessThanOrEqual(20)
  })

  it("stores templates with denormalised columns", async () => {
    const repos = make()
    const spec = quoteTemplate as unknown as SlideshowSpec
    const t = await repos.templates.create(WS, { name: "Quotes", spec, createdBy: WS })
    expect(t).toMatchObject({ aspectRatio: "4:5", slideCount: spec.slides.length, specVersion: 1 })
    expect((await repos.templates.get(WS, t.id))?.spec).toEqual(spec)
    expect(await repos.templates.get(OTHER, t.id)).toBeNull()
    const renamed = await repos.templates.update(WS, t.id, { name: "Quotes 2" })
    expect(renamed.name).toBe("Quotes 2")
    const listed = await repos.templates.list(WS)
    expect(listed.items.map((x) => x.name)).toEqual(["Quotes 2"])
    expect(listed.items[0]).not.toHaveProperty("spec")
    await repos.templates.archive(WS, t.id)
    expect((await repos.templates.list(WS)).items).toEqual([])
    expect((await repos.templates.list(WS, { includeArchived: true })).items).toHaveLength(1)
  })

  it("keeps collection names unique and orders media for collection picks", async () => {
    const repos = make()
    const c = await repos.collections.create(WS, { name: "bedroom", createdBy: WS })
    await expect(repos.collections.create(WS, { name: "bedroom", createdBy: WS })).rejects.toBeInstanceOf(DataConflictError)
    expect((await repos.collections.create(OTHER, { name: "bedroom", createdBy: OTHER })).name).toBe("bedroom")
    const other = await repos.collections.create(WS, { name: "kitchen", createdBy: WS })
    await expect(repos.collections.rename(WS, other.id, "bedroom")).rejects.toBeInstanceOf(DataConflictError)

    const base = { kind: "image" as const, mimeType: "image/png", sizeBytes: 1, source: "upload" as const, createdBy: WS }
    const m1 = await repos.media.create(WS, { ...base, collectionId: c.id, fileId: "f1", sha256: "a" })
    const m2 = await repos.media.create(WS, { ...base, collectionId: c.id, fileId: "f2", sha256: "b" })
    const dup = await repos.media.create(WS, { ...base, collectionId: c.id, fileId: "f3", sha256: "a" })
    expect(dup).toEqual({ value: m1.value, created: false })
    expect(m2.value.position).toBe(1)
    expect(await repos.media.listIdsInCollection(WS, c.id)).toEqual([m1.value.id, m2.value.id])
    expect((await repos.collections.get(WS, c.id))?.itemCount).toBe(2)
    expect((await repos.media.getMany(WS, [m2.value.id, "missing", m1.value.id])).map((m) => m.id)).toEqual([
      m2.value.id,
      m1.value.id,
    ])
    expect(await repos.media.getMany(OTHER, [m1.value.id])).toEqual([])
    expect(await repos.media.countByFileId(WS, "f1")).toBe(1)
    expect((await repos.media.findBySha256(WS, "a")).map((m) => m.id)).toEqual([m1.value.id])

    const loose = await repos.media.create(WS, { ...base, fileId: "f9", sha256: "z" })
    expect((await repos.media.list(WS, { collectionId: null })).items.map((m) => m.id)).toEqual([loose.value.id])
    const moved = await repos.media.move(WS, loose.value.id, other.id)
    expect(moved.collectionId).toBe(other.id)
    expect((await repos.collections.get(WS, other.id))?.itemCount).toBe(1)

    await repos.media.softDelete(WS, m1.value.id)
    expect(await repos.media.listIdsInCollection(WS, c.id)).toEqual([m2.value.id])
    expect((await repos.collections.get(WS, c.id))?.itemCount).toBe(1)

    await repos.collections.setPinned(WS, other.id, true)
    expect((await repos.collections.list(WS)).items[0].id).toBe(other.id)
    await repos.collections.softDelete(WS, c.id)
    expect((await repos.collections.list(WS)).items.map((x) => x.id)).toEqual([other.id])
    expect((await repos.collections.get(WS, c.id))?.purgeAfter).toBeTruthy()
    expect((await repos.collections.restore(WS, c.id)).deletedAt).toBeNull()
    expect((await repos.collections.getByName(WS, "kitchen"))?.id).toBe(other.id)
  })

  it("creates hashed API keys and resolves them until revoked", async () => {
    const repos = make()
    const { apiKey, plaintext } = await repos.apiKeys.create(WS, { name: "cli", scopes: ["renders:write"], createdBy: WS })
    expect(looksLikeApiKey(plaintext)).toBe(true)
    expect(apiKey.keyHash).not.toContain(plaintext)
    expect(apiKey.scopes).toEqual(["renders:write"])
    expect((await repos.apiKeys.resolve(plaintext))?.workspaceId).toBe(WS)
    await repos.apiKeys.touch(WS, apiKey.id, "2026-10-09T08:00:00.000Z")
    expect((await repos.apiKeys.list(WS))[0].lastUsedAt).toBe("2026-10-09T08:00:00.000Z")
    await repos.apiKeys.revoke(WS, apiKey.id)
    expect(await repos.apiKeys.resolve(plaintext)).toBeNull()
    expect(await repos.apiKeys.resolve("lc_000000_" + "x".repeat(32))).toBeNull()
  })

  it("claims jobs once per attempt and retries with backoff", async () => {
    const c = clock()
    const repos = make(c.now)
    const { value: job } = await repos.jobs.enqueue({
      workspaceId: WS,
      type: "render-slideshow",
      payload: { renderId: "r1" },
      maxAttempts: 2,
      dedupeKey: "render:r1",
    })
    const again = await repos.jobs.enqueue({ workspaceId: WS, type: "render-slideshow", payload: { renderId: "r1" }, dedupeKey: "render:r1" })
    expect(again.created).toBe(false)
    expect(await repos.jobs.get(OTHER, job.id)).toBeNull()
    expect((await repos.jobs.get(WS, job.id))?.payload).toEqual({ renderId: "r1" })

    const [claimed] = await repos.jobs.claim("w1", { limit: 5, leaseMs: 30_000 })
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempt: 1, workerId: "w1" })
    expect(await repos.jobs.claim("w2", { limit: 5, leaseMs: 30_000 })).toEqual([])
    expect(await repos.leases.acquire(job.id, 1, "w2", c.now().toISOString())).toBe(false)
    expect((await repos.leases.get(job.id, 1))?.workerId).toBe("w1")
    expect(await repos.jobs.renew(job.id, "w2", 1000)).toBe(false)
    expect(await repos.jobs.renew(job.id, "w1", 60_000)).toBe(true)

    const retried = await repos.jobs.fail(job.id, "w1", "boom")
    expect(retried.status).toBe("queued")
    expect(await repos.jobs.claim("w2", { limit: 5, leaseMs: 30_000 })).toEqual([])
    c.advance(60_000)
    const [second] = await repos.jobs.claim("w2", { limit: 5, leaseMs: 30_000 })
    expect(second.attempt).toBe(2)
    expect((await repos.jobs.fail(job.id, "w2", "boom")).status).toBe("dead")
    expect((await repos.jobs.listForWorkspace(WS)).items.map((j) => j.id)).toEqual([job.id])
  })

  it("filters claims by type and reclaims jobs whose lease expired", async () => {
    const c = clock()
    const repos = make(c.now)
    await repos.jobs.enqueue({ workspaceId: null, type: "notify", payload: { notificationId: "n1" } })
    expect(await repos.jobs.claim("w1", { limit: 1, leaseMs: 1_000, types: ["publish-post"] })).toEqual([])
    await repos.jobs.claim("w1", { limit: 1, leaseMs: 1_000 })
    c.advance(5_000)
    const [reclaimed] = await repos.jobs.claim("w2", { limit: 1, leaseMs: 1_000 })
    expect(reclaimed).toMatchObject({ workerId: "w2", attempt: 2 })
    await expect(repos.jobs.complete(reclaimed.id, "w1")).rejects.toBeInstanceOf(DataConflictError)
    const done = await repos.jobs.complete(reclaimed.id, "w2", { ok: true })
    expect(done).toMatchObject({ status: "succeeded", result: { ok: true } })
    c.advance(8 * 24 * 3600_000)
    expect(await repos.leases.purgeOlderThan(new Date(c.now().getTime() - 7 * 24 * 3600_000).toISOString())).toBe(2)
  })

  it("marks a job dead when its lease expires on the final attempt", async () => {
    const c = clock()
    const repos = make(c.now)
    const { value: job } = await repos.jobs.enqueue({
      workspaceId: WS,
      type: "notify",
      payload: { notificationId: "n1" },
      maxAttempts: 2,
    })
    expect(await repos.jobs.claim("w1", { limit: 1, leaseMs: 1_000 })).toHaveLength(1)
    c.advance(5_000)
    expect(await repos.jobs.claim("w2", { limit: 1, leaseMs: 1_000 })).toMatchObject([{ attempt: 2 }])
    c.advance(5_000)
    // Both lease holders "crashed": the third claim must not restart the job.
    expect(await repos.jobs.claim("w3", { limit: 1, leaseMs: 1_000 })).toEqual([])
    const dead = await repos.jobs.get(WS, job.id)
    expect(dead).toMatchObject({ status: "dead", attempt: 2, workerId: null, leaseExpiresAt: null })
    expect(dead?.error).toMatch(/lease expired/i)
    c.advance(5_000)
    expect(await repos.jobs.claim("w4", { limit: 1, leaseMs: 1_000 })).toEqual([])
  })

  it("schedules posts and delivers in-app notifications", async () => {
    const repos = make()
    const intent = { renderId: "r1", provider: "tiktok", accountId: "42", caption: "hi", intentKey: "r1:42", createdBy: WS }
    const { value: post } = await repos.posts.upsertIntent(WS, { ...intent, publishAt: "2026-10-10T09:00:00.000Z" })
    expect(post.status).toBe("scheduled")
    expect(post.publishAt).toBe("2026-10-10T09:00:00.000Z")
    expect((await repos.posts.upsertIntent(WS, intent)).created).toBe(false)
    const range = { from: "2026-10-10T00:00:00.000Z", to: "2026-10-11T00:00:00.000Z" }
    expect(await repos.posts.listRange(WS, range)).toHaveLength(1)
    expect(await repos.posts.listRange(OTHER, range)).toHaveLength(0)
    expect(await repos.posts.listDue("2026-10-10T08:59:59.000Z", 10)).toHaveLength(0)
    expect(await repos.posts.listDue("2026-10-10T09:00:00.000Z", 10)).toHaveLength(1)
    const published = await repos.posts.update(WS, post.id, {
      status: "published",
      publishedAt: "2026-10-12T10:00:00.000Z",
      platformOptions: { privacy_status: "PUBLIC_TO_EVERYONE" },
    })
    expect(published.platformOptions).toEqual({ privacy_status: "PUBLIC_TO_EVERYONE" })
    expect(await repos.posts.listRange(WS, range)).toHaveLength(0)
    expect(await repos.posts.listRange(WS, { from: "2026-10-12T00:00:00.000Z", to: "2026-10-13T00:00:00.000Z" })).toHaveLength(1)
    expect((await repos.posts.listByRender(WS, "r1")).map((p) => p.id)).toEqual([post.id])
    expect((await repos.posts.cancel(WS, post.id)).status).toBe("canceled")

    const { value: n } = await repos.notifications.schedule(WS, {
      event: "post.upcoming",
      postId: post.id,
      title: "Posting soon",
      deliverAt: "2026-10-10T08:00:00.000Z",
      dedupeKey: `upcoming:${post.id}`,
    })
    expect((await repos.notifications.schedule(WS, { event: "post.upcoming", title: "x", deliverAt: n.deliverAt, dedupeKey: n.dedupeKey })).created).toBe(false)
    expect(await repos.notifications.listDue("2026-10-10T08:00:00.000Z", 10)).toHaveLength(1)
    await repos.notifications.markDelivered(WS, n.id)
    expect(await repos.notifications.unreadCount(WS)).toBe(1)
    expect((await repos.notifications.list(WS)).items.map((x) => x.id)).toEqual([n.id])
    expect(await repos.notifications.markAllRead(WS)).toBe(1)
    expect(await repos.notifications.unreadCount(WS)).toBe(0)

    const { value: later } = await repos.notifications.schedule(WS, {
      event: "post.upcoming",
      postId: "p2",
      title: "Later",
      deliverAt: "2026-10-11T08:00:00.000Z",
      dedupeKey: "upcoming:p2",
    })
    expect(await repos.notifications.cancelForPost(WS, "p2")).toBe(1)
    expect((await repos.notifications.get(WS, later.id))?.status).toBe("canceled")
  })

  it("returns default settings and merges patches", async () => {
    const repos = make()
    expect((await repos.settings.get(WS)).timezone).toBe("UTC")
    const next = await repos.settings.patch(WS, { timezone: "Asia/Singapore" })
    expect(next).toMatchObject({ workspaceId: WS, timezone: "Asia/Singapore", disabledAccountIds: [] })
    const again = await repos.settings.patch(WS, { disabledAccountIds: ["7"] })
    expect(again).toMatchObject({ timezone: "Asia/Singapore", disabledAccountIds: ["7"] })
    expect((await repos.settings.get(OTHER)).timezone).toBe("UTC")
  })

  it("stores blobs per workspace and overwrites in place", async () => {
    const repos = make()
    await repos.blobs.put(WS, "renders", "r1-01", new Uint8Array([1, 2, 3]), "image/png")
    expect((await repos.blobs.get(WS, "renders", "r1-01"))?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    await repos.blobs.put(WS, "renders", "r1-01", new Uint8Array([4]), "image/png")
    expect(await repos.blobs.head(WS, "renders", "r1-01")).toMatchObject({ sizeBytes: 1, mime: "image/png" })
    expect(await repos.blobs.get(OTHER, "renders", "r1-01")).toBeNull()
    await expect(repos.blobs.put(OTHER, "renders", "r1-01", new Uint8Array([9]), "image/png")).rejects.toBeInstanceOf(DataConflictError)
    await expect(repos.blobs.signedUrl(OTHER, "renders", "r1-01", { expiresInSeconds: 60 })).rejects.toBeInstanceOf(DataNotFoundError)
    expect(await repos.blobs.signedUrl(WS, "renders", "r1-01", { expiresInSeconds: 60 })).toBeTruthy()
    await repos.blobs.delete(OTHER, "renders", "r1-01")
    expect(await repos.blobs.head(WS, "renders", "r1-01")).not.toBeNull()
    await repos.blobs.delete(WS, "renders", "r1-01")
    expect(await repos.blobs.head(WS, "renders", "r1-01")).toBeNull()
  })
})

describe("appwrite adapter specifics", () => {
  it("signs file URLs for the ownership-checked route", async () => {
    const c = clock()
    const fake = createFakeAppwrite({ now: c.now })
    const repos = createAppwriteRepositories({
      tables: fake.tables,
      storage: fake.storage,
      now: c.now,
      signedUrls: { baseUrl: "https://app.test", secret: "s3cret" },
    })
    await repos.blobs.put(WS, "renders", "r1-01", new Uint8Array([1]), "image/png")
    const url = new URL(await repos.blobs.signedUrl(WS, "renders", "r1-01", { expiresInSeconds: 600, download: true }))
    expect(url.origin + url.pathname).toBe("https://app.test/api/files/renders/r1-01")
    const nowSeconds = Math.floor(c.now().getTime() / 1000)
    const claims = verifyFileToken(url.searchParams.get("t")!, nowSeconds, "s3cret")
    expect(claims).toMatchObject({ workspaceId: WS, bucket: "renders", fileId: "r1-01", download: true })
    expect(verifyFileToken(url.searchParams.get("t")!, nowSeconds + 601, "s3cret")).toBeNull()
    expect(verifyFileToken(url.searchParams.get("t")!, nowSeconds, "other")).toBeNull()
  })

  it("names files with the workspace and an allowed extension", () => {
    expect(storedFileName("user_1", "abc-01", "image/png")).toBe("user_1~abc-01.png")
    expect(storedFileName("user_1", "abc", "image/jpeg")).toBe("user_1~abc.jpg")
  })

  it("hashes lease ids that would exceed 36 chars", () => {
    expect(leaseRowId("0123456789abcdef0123", 1)).toBe("0123456789abcdef0123.1")
    const long = leaseRowId("j" + "a".repeat(35), 12)
    expect(long).toHaveLength(36)
    expect(long.startsWith("l")).toBe(true)
  })

  it("rejects writes to undeclared columns (schema drift guard)", async () => {
    const fake = createFakeAppwrite()
    await expect(
      fake.tables.createRow({ databaseId: "lumenclip", tableId: "renders", rowId: "x1", data: { bogus: 1 } })
    ).rejects.toMatchObject({ code: 400 })
  })
})
