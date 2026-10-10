import { afterEach, describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"
import type { ResolvedSpec } from "@/lib/render/spec"

import {
  JobHandlerNotRegisteredError,
  PermanentJobError,
  placeholderJobHandler,
  registerJobHandler,
  resetJobHandlers,
  RetryJobError,
} from "./handlers"
import { createWorker, RENDER_LEASE_EXHAUSTED_MESSAGE } from "./worker"

const WS = "user_alice"
const quiet = { info() {}, warn() {}, error() {} }

function clock(start = "2026-10-09T08:00:00.000Z") {
  let t = new Date(start).getTime()
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) }
}

afterEach(() => resetJobHandlers())

describe("worker", () => {
  it("runs a registered handler and completes the job", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    const seen: string[] = []
    registerJobHandler("render-slideshow", async (job, ctx) => {
      const { renderId } = job.payload
      seen.push(renderId)
      expect(await ctx.renewLease?.()).toBe(true)
      return { rendered: renderId }
    })
    const { value: job } = await repos.jobs.enqueue({ workspaceId: WS, type: "render-slideshow", payload: { renderId: "r1" } })
    const worker = createWorker({ repos, workerId: "w1", now: c.now, log: quiet })
    const result = await worker.tick()
    expect(result).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 })
    expect(seen).toEqual(["r1"])
    expect(await repos.jobs.get(WS, job.id)).toMatchObject({ status: "succeeded", result: { rendered: "r1" } })
  })

  it("retries, honours RetryJobError and stops on PermanentJobError", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    let calls = 0
    registerJobHandler("publish-post", async () => {
      calls++
      if (calls === 1) throw new Error("socialbu 503")
      if (calls === 2) throw new RetryJobError("rate limited", new Date(c.now().getTime() + 3_600_000))
      throw new PermanentJobError("account disconnected")
    })
    const { value: job } = await repos.jobs.enqueue({ workspaceId: WS, type: "publish-post", payload: { postId: "p1" } })
    const worker = createWorker({ repos, workerId: "w1", now: c.now, log: quiet })

    await worker.tick()
    expect((await repos.jobs.get(WS, job.id))?.status).toBe("queued")
    c.advance(5_000)
    await worker.tick()
    const retried = await repos.jobs.get(WS, job.id)
    expect(retried?.runAt).toBe(new Date(c.now().getTime() + 3_600_000).toISOString())
    c.advance(3_600_000)
    await worker.tick()
    expect(await repos.jobs.get(WS, job.id)).toMatchObject({ status: "dead", error: "account disconnected" })
  })

  it("keeps placeholder jobs queued for a later deploy instead of losing them", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    registerJobHandler("render-slideshow", placeholderJobHandler("render-slideshow"))
    const { value: job } = await repos.jobs.enqueue({ workspaceId: WS, type: "render-slideshow", payload: { renderId: "r1" } })
    await createWorker({ repos, workerId: "w1", now: c.now, log: quiet }).tick()
    const after = await repos.jobs.get(WS, job.id)
    expect(after?.status).toBe("queued")
    expect(after?.error).toBe(new JobHandlerNotRegisteredError("render-slideshow").message)
  })

  it("sweeps due notifications into notify jobs and delivers them once", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    const { value: n } = await repos.notifications.schedule(WS, {
      event: "render.succeeded",
      title: "Render ready",
      deliverAt: "2026-10-09T07:59:00.000Z",
      dedupeKey: "render:r1",
    })
    const a = createWorker({ repos, workerId: "a", now: c.now, log: quiet })
    const b = createWorker({ repos, workerId: "b", now: c.now, log: quiet })
    expect((await a.sweep(true))?.notifications).toBe(1)
    expect((await b.sweep(true))?.notifications).toBe(0)
    await a.tick()
    expect((await repos.notifications.get(WS, n.id))?.status).toBe("delivered")
    expect(await repos.notifications.unreadCount(WS)).toBe(1)
  })

  it("enqueues due scheduled posts that SocialBu has not scheduled yet", async () => {
    const c = clock()
    const repos = createMemoryRepositories({ now: c.now })
    const base = { renderId: "r1", provider: "tiktok", caption: "", createdBy: WS, publishAt: "2026-10-09T07:00:00.000Z" }
    await repos.posts.upsertIntent(WS, { ...base, accountId: "1", intentKey: "a" })
    const { value: native } = await repos.posts.upsertIntent(WS, { ...base, accountId: "2", intentKey: "b" })
    await repos.posts.update(WS, native.id, { providerPostId: "sb-9" })
    const swept = await createWorker({ repos, workerId: "w", now: c.now, log: quiet }).sweep(true)
    expect(swept).toMatchObject({ posts: 1 })
  })

  describe("dead render jobs", () => {
    const spec: ResolvedSpec = {
      version: 1,
      canvas: { width: 1080, height: 1350, background: "#000000" },
      fonts: [],
      slides: [{ id: "s1", background: "#000000", layers: [] }],
    }

    async function setup(maxAttempts = 1) {
      const c = clock()
      const repos = createMemoryRepositories({ now: c.now })
      const { value: render } = await repos.renders.create(WS, { spec, source: "ui", createdBy: WS, title: "Launch deck" })
      const { value: job } = await repos.jobs.enqueue({
        workspaceId: WS,
        type: "render-slideshow",
        payload: { renderId: render.id },
        dedupeKey: `render:${render.id}`,
        maxAttempts,
      })
      return { c, repos, render, job }
    }

    /** The worker holding the only attempt "crashes" mid-render; the next claim marks the job dead. */
    async function crashUntilDead({ c, repos, render, job }: Awaited<ReturnType<typeof setup>>) {
      expect(await repos.jobs.claim("w1", { limit: 1, leaseMs: 1_000 })).toHaveLength(1)
      await repos.renders.markRendering(WS, render.id, job.id)
      c.advance(5_000)
      expect(await repos.jobs.claim("w2", { limit: 1, leaseMs: 1_000 })).toEqual([])
      expect((await repos.jobs.get(WS, job.id))?.status).toBe("dead")
    }

    it("fails the render of a job whose lease was exhausted, notifies once and is idempotent", async () => {
      const ctx = await setup()
      await crashUntilDead(ctx)
      const { c, repos, render } = ctx
      const worker = createWorker({ repos, workerId: "w3", now: c.now, log: quiet })

      expect(await worker.sweep(true)).toMatchObject({ rendersFailed: 1 })
      const failed = await repos.renders.get(WS, render.id)
      expect(failed).toMatchObject({ status: "failed", error: RENDER_LEASE_EXHAUSTED_MESSAGE })
      const notes = (await repos.notifications.list(WS)).items
      expect(notes).toHaveLength(1)
      expect(notes[0]).toMatchObject({ event: "render.failed", renderId: render.id })

      // A second sweep (or another replica) leaves the settled render alone.
      c.advance(60_000)
      expect(await worker.sweep(true)).toMatchObject({ rendersFailed: 0 })
      expect(await createWorker({ repos, workerId: "w4", now: c.now, log: quiet }).sweep(true)).toMatchObject({
        rendersFailed: 0,
      })
      expect((await repos.notifications.list(WS)).items).toHaveLength(1)
    })

    it("runs as part of the periodic tick", async () => {
      const ctx = await setup()
      await crashUntilDead(ctx)
      const result = await createWorker({ repos: ctx.repos, workerId: "w3", now: ctx.c.now, log: quiet }).tick()
      expect(result.swept).toMatchObject({ rendersFailed: 1 })
      expect((await ctx.repos.renders.get(WS, ctx.render.id))?.status).toBe("failed")
    })

    it("records the job error when the job died some other way and the render was left unsettled", async () => {
      const { c, repos, render, job } = await setup()
      await repos.jobs.claim("w1", { limit: 1, leaseMs: 1_000 })
      await repos.renders.markRendering(WS, render.id, job.id)
      await repos.jobs.fail(job.id, "w1", "engine exploded")
      await createWorker({ repos, workerId: "w2", now: c.now, log: quiet }).sweep(true)
      expect(await repos.renders.get(WS, render.id)).toMatchObject({
        status: "failed",
        error: "Render job failed: engine exploded",
      })
    })

    it("skips settled renders, renders owned by another job and jobs outside the lookback window", async () => {
      const done = await setup()
      await crashUntilDead(done)
      await done.repos.renders.markSucceeded(WS, done.render.id, { slides: [], coverFileId: null })
      expect(await createWorker({ repos: done.repos, workerId: "w", now: done.c.now, log: quiet }).sweep(true)).toMatchObject({
        rendersFailed: 0,
      })
      expect((await done.repos.renders.get(WS, done.render.id))?.status).toBe("succeeded")

      const moved = await setup()
      await crashUntilDead(moved)
      await moved.repos.renders.markRendering(WS, moved.render.id, "newer-job")
      expect(await createWorker({ repos: moved.repos, workerId: "w", now: moved.c.now, log: quiet }).sweep(true)).toMatchObject({
        rendersFailed: 0,
      })
      expect((await moved.repos.renders.get(WS, moved.render.id))?.status).toBe("rendering")

      const old = await setup()
      await crashUntilDead(old)
      old.c.advance(2 * 3_600_000)
      const worker = createWorker({ repos: old.repos, workerId: "w", now: old.c.now, log: quiet, deadRenderLookbackMs: 3_600_000 })
      expect(await worker.sweep(true)).toMatchObject({ rendersFailed: 0 })
    })

    it("still fails the render when the notification cannot be emitted", async () => {
      const ctx = await setup()
      await crashUntilDead(ctx)
      const repos = ctx.repos
      const broken = {
        ...repos,
        settings: {
          ...repos.settings,
          get: async () => {
            throw new Error("settings down")
          },
        },
      }
      const warnings: string[] = []
      const log = { ...quiet, warn: (message: string) => warnings.push(message) }
      expect(await createWorker({ repos: broken, workerId: "w", now: ctx.c.now, log }).sweep(true)).toMatchObject({
        rendersFailed: 1,
      })
      expect((await repos.renders.get(WS, ctx.render.id))?.status).toBe("failed")
      expect(warnings).toContain("render-failed notification failed")
    })
  })

  it("stops its run loop", async () => {
    const repos = createMemoryRepositories()
    const worker = createWorker({ repos, workerId: "w", log: quiet, minPollMs: 5, maxPollMs: 10 })
    const running = worker.run()
    setTimeout(() => worker.stop(), 30)
    await expect(running).resolves.toBeUndefined()
  })
})
