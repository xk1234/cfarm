import { describe, expect, it } from "vitest"

import {
  calendarItemFromPost,
  calendarItemMatchesFilters,
  calendarSummary,
  calendarTimingEntries,
} from "@/lib/calendar-items"
import { listCalendarItems } from "@/lib/calendar-feed"
import { calendarAlertSummary } from "@/lib/calendar-summary"
import { createMemoryRepositories, type Post } from "@/lib/data"
import { NotConfiguredPublisher } from "@/lib/publishing/publisher"
import type { ResolvedSpec } from "@/lib/render/spec"

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    workspaceId: "u1",
    renderId: "render-1",
    provider: "tiktok",
    accountId: "101",
    status: "scheduled",
    publishAt: "2026-10-10T09:00:00.000Z",
    publishedAt: null,
    caption: "First line\nsecond",
    platformOptions: {},
    providerPostId: "9001",
    externalPostId: null,
    permalink: null,
    error: null,
    intentKey: "k",
    createdBy: "u1",
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z",
    ...overrides,
  }
}

describe("calendar items", () => {
  it("projects scheduled posts with cancel/reschedule links", () => {
    const item = calendarItemFromPost(post(), { accountName: "Creator", timezone: "Asia/Singapore" })!
    expect(item).toMatchObject({
      id: "post-1",
      status: "scheduled",
      datetime: "2026-10-10T09:00:00.000Z",
      timezone: "Asia/Singapore",
      title: "First line",
      source: "post",
      targets: [{ integrationId: "101", integrationName: "Creator", provider: "tiktok", status: "scheduled" }],
      links: {
        cancel: "/api/publishing/posts/post-1",
        reschedule: "/api/publishing/posts/post-1",
      },
    })
    expect(calendarTimingEntries(item)[1]).toEqual({ label: "Expected to be published on", at: "2026-10-10T09:00:00.000Z" })
  })

  it("uses the publish time for published posts and offers retry for failures", () => {
    const published = calendarItemFromPost(
      post({ status: "published", publishedAt: "2026-10-10T09:01:00.000Z", permalink: "https://t.co/x" })
    )!
    expect(published).toMatchObject({ datetime: "2026-10-10T09:01:00.000Z", links: { live: "https://t.co/x" } })
    expect(published.links.cancel).toBeUndefined()
    expect(calendarItemFromPost(post({ status: "failed", error: "Nope" }))!.links.retry).toBe(
      "/api/publishing/posts/post-1/retry"
    )
    expect(calendarItemFromPost(post({ status: "canceled" }))).toBeNull()
  })

  it("filters and summarises", () => {
    const items = [
      calendarItemFromPost(post())!,
      calendarItemFromPost(post({ id: "p2", status: "failed", provider: "instagram", accountId: "202" }))!,
    ]
    expect(calendarSummary(items)).toEqual({ needsAction: 0, failed: 1, planned: 1 })
    expect(items.filter((item) => calendarItemMatchesFilters(item, { platforms: new Set(["instagram"]) }))).toHaveLength(1)
  })

  it("reads posts in range joined with their render, and summarises alerts", async () => {
    const repos = createMemoryRepositories({ now: () => new Date("2026-10-09T12:00:00.000Z") })
    const { value: render } = await repos.renders.create("u1", {
      spec: { canvas: { width: 1080, height: 1350 }, slides: [{}] } as unknown as ResolvedSpec,
      source: "ui",
      title: "Quote carousel",
      createdBy: "u1",
    })
    await repos.renders.markSucceeded("u1", render.id, {
      slides: [{ index: 0, slideId: "s0", fileId: "f0", mime: "image/png", sizeBytes: 1, width: 1080, height: 1350 }],
      coverFileId: "f0",
    })
    for (const [key, publishAt, status] of [
      ["a", "2026-10-10T09:00:00.000Z", "scheduled"],
      ["b", "2026-11-20T09:00:00.000Z", "scheduled"],
      ["c", "2026-10-08T09:00:00.000Z", "publishing"],
    ] as const) {
      await repos.posts.upsertIntent("u1", {
        renderId: render.id,
        provider: "tiktok",
        accountId: "101",
        status,
        publishAt,
        caption: "",
        intentKey: key,
        createdBy: "u1",
      })
    }
    const failed = (await repos.posts.listByRender("u1", render.id)).find((p) => p.intentKey === "c")!
    await repos.posts.update("u1", failed.id, { status: "failed", error: "x" })

    const { items, summary } = await listCalendarItems(
      "u1",
      { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" },
      { repos, publisher: new NotConfiguredPublisher() }
    )
    expect(items.map((item) => [item.status, item.title, item.previewUrl])).toEqual([
      ["failed", "Quote carousel", "/api/files/renders/f0"],
      ["scheduled", "Quote carousel", "/api/files/renders/f0"],
    ])
    expect(summary).toEqual({ needsAction: 0, failed: 1, planned: 1 })
    expect(await listCalendarItems("other", { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" }, { repos, publisher: new NotConfiguredPublisher() })).toEqual({
      items: [],
      summary: { needsAction: 0, failed: 0, planned: 0 },
    })

    expect(await calendarAlertSummary("u1", { repos, now: () => new Date("2026-10-09T12:00:00.000Z") })).toEqual({
      needsAction: 0,
      failed: 1,
      upcoming: 1,
    })
  })
})
