import { beforeEach, describe, expect, it } from "vitest"

import { createMemoryRepositories, type Post, type Repositories } from "@/lib/data"
import { jobHandlers } from "@/lib/jobs/handlers"
import {
  deliverDueNotifications,
  emitNotification,
  listNotifications,
  notifyPostOutcome,
  notifyRenderFinished,
  schedulePostReminders,
} from "@/lib/notifications"

const WS = "user_1"
let clock: Date
let repos: Repositories
const now = () => clock

beforeEach(() => {
  clock = new Date("2026-10-09T12:00:00.000Z")
  repos = createMemoryRepositories({ now })
})

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    workspaceId: WS,
    renderId: "render-1",
    provider: "instagram",
    accountId: "202",
    status: "scheduled",
    publishAt: "2026-10-09T15:00:00.000Z",
    publishedAt: null,
    caption: "c",
    platformOptions: {},
    providerPostId: "9001",
    externalPostId: null,
    permalink: null,
    error: null,
    intentKey: "k",
    createdBy: WS,
    createdAt: clock.toISOString(),
    updatedAt: clock.toISOString(),
    ...overrides,
  }
}

describe("in-app notifications", () => {
  it("delivers render notifications immediately and dedupes them", async () => {
    const render = { id: "render-1", status: "succeeded" as const, title: "Five tips", error: null, slideCount: 5 }
    const first = await notifyRenderFinished(WS, render, { repos, now })
    const again = await notifyRenderFinished(WS, render, { repos, now })
    expect(first).toMatchObject({ event: "render.succeeded", title: "Five tips rendered", body: "5 slides ready.", status: "delivered" })
    expect(again!.id).toBe(first!.id)

    await notifyRenderFinished(WS, { ...render, id: "render-2", status: "failed", error: "Font missing" }, { repos, now })
    const inbox = await listNotifications(WS, {}, { repos })
    expect(inbox.unreadCount).toBe(2)
    expect(inbox.items.map((n) => n.event).sort()).toEqual(["render.failed", "render.succeeded"])
    expect(await notifyRenderFinished(WS, { ...render, status: "rendering" as never }, { repos, now })).toBeNull()
  })

  it("is suppressed when notifications are set to none", async () => {
    await repos.settings.patch(WS, { reminders: { enabled: false, leadMinutes: [60] } })
    expect(await notifyPostOutcome(WS, post({ status: "failed", error: "Token expired" }), { repos, now })).toBeNull()
    expect(await schedulePostReminders(WS, post(), { repos, now })).toEqual([])
    expect((await listNotifications(WS, {}, { repos })).items).toEqual([])
  })

  it("schedules upcoming-post reminders and delivers them through the notify job", async () => {
    await repos.settings.patch(WS, { reminders: { enabled: true, leadMinutes: [30, 60, 600] } })
    const p = post()
    await repos.posts.upsertIntent(WS, {
      renderId: p.renderId,
      provider: p.provider,
      accountId: p.accountId,
      status: "scheduled",
      publishAt: p.publishAt,
      caption: p.caption,
      intentKey: "k",
      createdBy: WS,
    })
    const stored = (await repos.posts.listByRender(WS, "render-1"))[0]!
    const reminders = await schedulePostReminders(WS, stored, { repos, now })
    // 600 minutes before is already in the past.
    expect(reminders.map((n) => n.deliverAt)).toEqual(["2026-10-09T14:30:00.000Z", "2026-10-09T14:00:00.000Z"])
    expect(reminders.every((n) => n.status === "pending")).toBe(true)

    const notifyJobs = (await repos.jobs.listForWorkspace(WS)).items.filter((job) => job.type === "notify")
    expect(notifyJobs.map((job) => job.runAt).sort()).toEqual(["2026-10-09T14:00:00.000Z", "2026-10-09T14:30:00.000Z"])

    clock = new Date("2026-10-09T14:00:00.000Z")
    const early = notifyJobs.find((job) => job.runAt === "2026-10-09T14:00:00.000Z")!
    expect(await jobHandlers.notify!(early as never, { workerId: "w1", repos, now })).toEqual({ status: "delivered" })
    expect((await listNotifications(WS, {}, { repos })).items).toEqual([
      expect.objectContaining({ event: "post.upcoming", title: "Instagram post in 1 hour" }),
    ])

    // The post gets canceled; the remaining reminder is dropped instead of delivered.
    await repos.posts.cancel(WS, stored.id)
    clock = new Date("2026-10-09T14:30:00.000Z")
    expect(await deliverDueNotifications({ repos, now })).toBe(0)
    expect(await repos.notifications.listDue(clock.toISOString(), 10)).toEqual([])
  })

  it("marks notifications read", async () => {
    const n = await emitNotification(WS, { event: "post.failed", title: "Failed", dedupeKey: "x" }, { repos, now })
    await repos.notifications.markRead(WS, n!.id)
    expect((await listNotifications(WS, {}, { repos })).unreadCount).toBe(0)
  })
})
