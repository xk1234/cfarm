import { afterEach, describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"

import {
  JobHandlerNotRegisteredError,
  PermanentJobError,
  registerJobHandler,
  resetJobHandlers,
  RetryJobError,
} from "./handlers"
import { createWorker } from "./worker"

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
    registerJobHandler("render-slideshow", async ({ renderId }, ctx) => {
      seen.push(renderId)
      expect(await ctx.renewLease()).toBe(true)
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

  it("stops its run loop", async () => {
    const repos = createMemoryRepositories()
    const worker = createWorker({ repos, workerId: "w", log: quiet, minPollMs: 5, maxPollMs: 10 })
    const running = worker.run()
    setTimeout(() => worker.stop(), 30)
    await expect(running).resolves.toBeUndefined()
  })
})
