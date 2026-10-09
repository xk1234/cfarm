import { afterEach, describe, expect, it } from "vitest"

import {
  createMemoryRepositories,
  dataBackendFromEnv,
  AppwriteNotConfiguredError,
  DataConflictError,
  getRepositories,
  looksLikeApiKey,
  setRepositoriesForTesting,
} from "@/lib/data"
import type { ResolvedSpec } from "@/lib/render/spec"

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

describe("getRepositories", () => {
  afterEach(() => setRepositoriesForTesting(null))

  it("uses the memory backend under vitest and refuses unknown backends", () => {
    expect(getRepositories().backend).toBe("memory")
    expect(dataBackendFromEnv({})).toBe("appwrite")
    expect(dataBackendFromEnv({ LUMENCLIP_DATA_BACKEND: "memory" })).toBe("memory")
    expect(() => dataBackendFromEnv({ LUMENCLIP_DATA_BACKEND: "railway" })).toThrow()
  })

  it("refuses the Appwrite backend without credentials", () => {
    setRepositoriesForTesting(null)
    const prev = process.env.LUMENCLIP_DATA_BACKEND
    process.env.LUMENCLIP_DATA_BACKEND = "appwrite"
    try {
      expect(() => getRepositories()).toThrow(AppwriteNotConfiguredError)
    } finally {
      process.env.LUMENCLIP_DATA_BACKEND = prev
    }
  })
})

describe("memory repositories", () => {
  it("scopes rows to their workspace", async () => {
    const repos = createMemoryRepositories()
    const { value: render } = await repos.renders.create(WS, { spec: resolved, source: "ui", createdBy: WS })
    expect(await repos.renders.get(OTHER, render.id)).toBeNull()
    await expect(repos.renders.markFailed(OTHER, render.id, "x")).rejects.toThrow("not found")
    const done = await repos.renders.markSucceeded(WS, render.id, { slides: [], coverFileId: null })
    expect(done.status).toBe("succeeded")
    expect((await repos.renders.list(WS)).items.map((r) => r.id)).toEqual([render.id])
    expect((await repos.renders.list(OTHER)).items).toEqual([])
  })

  it("honours render idempotency keys", async () => {
    const repos = createMemoryRepositories()
    const a = await repos.renders.create(WS, { spec: resolved, source: "api", idempotencyKey: "k1", createdBy: WS })
    const b = await repos.renders.create(WS, { spec: resolved, source: "api", idempotencyKey: "k1", createdBy: WS })
    expect(b).toEqual({ value: a.value, created: false })
  })

  it("keeps collection names unique and orders media for collection picks", async () => {
    const repos = createMemoryRepositories()
    const c = await repos.collections.create(WS, { name: "bedroom", createdBy: WS })
    await expect(repos.collections.create(WS, { name: "bedroom", createdBy: WS })).rejects.toBeInstanceOf(DataConflictError)
    const base = { kind: "image" as const, mimeType: "image/png", sizeBytes: 1, source: "upload" as const, createdBy: WS }
    const m1 = await repos.media.create(WS, { ...base, collectionId: c.id, fileId: "f1", sha256: "a" })
    const m2 = await repos.media.create(WS, { ...base, collectionId: c.id, fileId: "f2", sha256: "b" })
    const dup = await repos.media.create(WS, { ...base, collectionId: c.id, fileId: "f3", sha256: "a" })
    expect(dup).toEqual({ value: m1.value, created: false })
    expect(await repos.media.listIdsInCollection(WS, c.id)).toEqual([m1.value.id, m2.value.id])
    expect((await repos.collections.get(WS, c.id))?.itemCount).toBe(2)
    await repos.media.softDelete(WS, m1.value.id)
    expect(await repos.media.listIdsInCollection(WS, c.id)).toEqual([m2.value.id])
  })

  it("creates hashed API keys and resolves them until revoked", async () => {
    const repos = createMemoryRepositories()
    const { apiKey, plaintext } = await repos.apiKeys.create(WS, { name: "cli", scopes: ["renders:write"], createdBy: WS })
    expect(looksLikeApiKey(plaintext)).toBe(true)
    expect(apiKey.keyHash).not.toContain(plaintext)
    expect((await repos.apiKeys.resolve(plaintext))?.workspaceId).toBe(WS)
    await repos.apiKeys.revoke(WS, apiKey.id)
    expect(await repos.apiKeys.resolve(plaintext)).toBeNull()
  })

  it("claims jobs once per attempt and retries with backoff", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    const { value: job } = await repos.jobs.enqueue({
      workspaceId: WS,
      type: "render-slideshow",
      payload: { renderId: "r1" },
      maxAttempts: 2,
      dedupeKey: "render:r1",
    })
    const again = await repos.jobs.enqueue({ workspaceId: WS, type: "render-slideshow", payload: { renderId: "r1" }, dedupeKey: "render:r1" })
    expect(again.created).toBe(false)

    const [claimed] = await repos.jobs.claim("w1", { limit: 5, leaseMs: 30_000 })
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempt: 1, workerId: "w1" })
    expect(await repos.jobs.claim("w2", { limit: 5, leaseMs: 30_000 })).toEqual([])
    expect(await repos.leases.acquire(job.id, 1, "w2", c.now().toISOString())).toBe(false)

    const retried = await repos.jobs.fail(job.id, "w1", "boom")
    expect(retried.status).toBe("queued")
    c.advance(60_000)
    const [second] = await repos.jobs.claim("w2", { limit: 5, leaseMs: 30_000 })
    expect(second.attempt).toBe(2)
    expect((await repos.jobs.fail(job.id, "w2", "boom")).status).toBe("dead")
  })

  it("reclaims jobs whose lease expired", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    await repos.jobs.enqueue({ workspaceId: null, type: "notify", payload: { notificationId: "n1" } })
    await repos.jobs.claim("w1", { limit: 1, leaseMs: 1_000 })
    c.advance(5_000)
    const [reclaimed] = await repos.jobs.claim("w2", { limit: 1, leaseMs: 1_000 })
    expect(reclaimed).toMatchObject({ workerId: "w2", attempt: 2 })
    await expect(repos.jobs.complete(reclaimed.id, "w1")).rejects.toBeInstanceOf(DataConflictError)
    expect((await repos.jobs.complete(reclaimed.id, "w2", { ok: true })).status).toBe("succeeded")
  })

  it("schedules posts and delivers in-app notifications", async () => {
    const repos = createMemoryRepositories()
    const intent = { renderId: "r1", provider: "tiktok", accountId: "42", caption: "hi", intentKey: "r1:42", createdBy: WS }
    const { value: post } = await repos.posts.upsertIntent(WS, { ...intent, publishAt: "2026-10-10T09:00:00.000Z" })
    expect(post.status).toBe("scheduled")
    expect((await repos.posts.upsertIntent(WS, intent)).created).toBe(false)
    expect(await repos.posts.listRange(WS, { from: "2026-10-10T00:00:00.000Z", to: "2026-10-11T00:00:00.000Z" })).toHaveLength(1)
    expect(await repos.posts.listDue("2026-10-10T09:00:00.000Z", 10)).toHaveLength(1)

    const { value: n } = await repos.notifications.schedule(WS, {
      event: "post.upcoming",
      postId: post.id,
      title: "Posting soon",
      deliverAt: "2026-10-10T08:00:00.000Z",
      dedupeKey: `upcoming:${post.id}`,
    })
    expect(await repos.notifications.listDue("2026-10-10T08:00:00.000Z", 10)).toHaveLength(1)
    await repos.notifications.markDelivered(WS, n.id)
    expect(await repos.notifications.unreadCount(WS)).toBe(1)
    expect(await repos.notifications.markAllRead(WS)).toBe(1)
    expect(await repos.notifications.unreadCount(WS)).toBe(0)
  })

  it("returns default settings and merges patches", async () => {
    const repos = createMemoryRepositories()
    expect((await repos.settings.get(WS)).timezone).toBe("UTC")
    const next = await repos.settings.patch(WS, { timezone: "Asia/Singapore" })
    expect(next).toMatchObject({ workspaceId: WS, timezone: "Asia/Singapore", disabledAccountIds: [] })
  })

  it("stores blobs per workspace", async () => {
    const repos = createMemoryRepositories()
    await repos.blobs.put(WS, "renders", "r1-01", new Uint8Array([1, 2, 3]), "image/png")
    expect((await repos.blobs.get(WS, "renders", "r1-01"))?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(await repos.blobs.get(OTHER, "renders", "r1-01")).toBeNull()
    expect(await repos.blobs.signedUrl(WS, "renders", "r1-01", { expiresInSeconds: 60 })).toMatch(/^memory:\/\/renders\/r1-01\?exp=/)
    await repos.blobs.delete(WS, "renders", "r1-01")
    expect(await repos.blobs.head(WS, "renders", "r1-01")).toBeNull()
  })
})
