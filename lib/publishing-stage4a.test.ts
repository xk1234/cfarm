import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Post } from "@/lib/posts"

const state = vi.hoisted(() => ({
  posts: [] as Post[],
  upsertPost: vi.fn(async (post: Post) => {
    const index = state.posts.findIndex(
      (item) => item.id === post.id || item.intentId === post.intentId
    )
    const stored = index >= 0 ? { ...state.posts[index], ...post } : post
    if (index >= 0) state.posts[index] = stored
    else state.posts.push(stored)
    return stored
  }),
}))

vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: async () => "owner-1",
}))
vi.mock("@/lib/post-repository", () => ({
  postRepository: {
    listPosts: async () => state.posts,
    upsertPost: state.upsertPost,
  },
}))
vi.mock("@/lib/reminders", () => ({
  enqueueReminder: vi.fn(async () => undefined),
}))

import {
  publishAutomationRun,
  publishPost,
  recordAwaitingManualAutomationRun,
  recordReadyForReviewAutomationRun,
  reschedulePost,
} from "@/lib/publishing"

beforeEach(() => {
  state.posts = []
  state.upsertPost.mockClear()
  vi.stubEnv("POST_REPOSITORY_WRITE_MODE", "legacy")
})

describe("Stage 4a publishing repository convergence", () => {
  it("preserves the legacy success and failure projections across retry", async () => {
    const failed = await publishPost({
      type: "now",
      integrationId: "account-1",
      provider: "tiktok",
      content: "  Caption with spacing  ",
      sourceType: "automation",
      sourceId: "run-1",
      request: async () => {
        throw new Error("PostFast 500")
      },
    })
    const retried = await publishPost({
      type: "schedule",
      date: "2099-07-30T12:00:00.000Z",
      integrationId: "account-1",
      provider: "tiktok",
      content: "  Caption with spacing  ",
      sourceType: "automation",
      sourceId: "run-1",
      request: async () => ({ postIds: ["postfast-1"] }) as never,
    })

    expect(failed.record).toMatchObject({
      sourceType: "automation",
      sourceId: "run-1",
      integrationId: "account-1",
      provider: "tiktok",
      status: "failed",
      linkState: "postfast_published",
      error: "PostFast 500",
      content: "  Caption with spacing  ",
      media: [],
    })
    expect(retried.record).toMatchObject({
      id: failed.record.id,
      postfastPostId: "postfast-1",
      status: "scheduled",
      scheduledAt: "2099-07-30T12:00:00.000Z",
      error: undefined,
    })
    expect(state.posts).toHaveLength(1)
  })

  it("keeps auto fan-out distinct and records review/manual lifecycle parity", async () => {
    const integrations = [
      { integration_id: "account-1", provider: "tiktok" as const, name: "TT" },
      {
        integration_id: "account-2",
        provider: "instagram" as const,
        name: "IG",
      },
    ]
    const automatic = await publishAutomationRun({
      runId: "run-auto",
      outputId: "slideshow-auto",
      scheduledFor: "2099-07-30T12:00:00.000Z",
      integrations,
      content: "Auto caption",
      now: new Date("2026-07-30T12:00:00.000Z"),
      request: async () => ({ postIds: ["postfast-1"] }) as never,
    })
    const review = await recordReadyForReviewAutomationRun({
      runId: "run-review",
      scheduledFor: "2099-07-30T12:00:00.000Z",
      integrations,
      content: "Review caption",
    })
    const manual = await recordAwaitingManualAutomationRun({
      runId: "run-manual",
      scheduledFor: "2099-07-30T12:00:00.000Z",
      integrations,
      content: "Manual caption",
    })

    expect(automatic.records).toHaveLength(2)
    expect(new Set(automatic.records.map((record) => record.id)).size).toBe(2)
    expect(review.records.map((record) => record.status)).toEqual([
      "ready_for_review",
      "ready_for_review",
    ])
    expect(manual.records.map((record) => record.status)).toEqual([
      "awaiting_manual_post",
      "awaiting_manual_post",
    ])
  })

  it("uses an explicit new intent for a deliberate canonical repost", async () => {
    vi.stubEnv("POST_REPOSITORY_WRITE_MODE", "canonical")
    const base = {
      type: "now" as const,
      integrationId: "account-1",
      provider: "tiktok",
      content: "Repost me",
      sourceType: "slideshow" as const,
      sourceId: "slideshow-1",
      outputId: "slideshow-1",
      request: async () => ({ postIds: ["postfast-1"] }) as never,
    }
    const first = await publishPost({ ...base, intentId: "repost-1" })
    const second = await publishPost({ ...base, intentId: "repost-2" })

    expect(first.record.id).not.toBe(second.record.id)
    expect(state.posts).toHaveLength(2)
  })

  it("reschedules the same intent while replacing the PostFast claim", async () => {
    const original = await publishPost({
      type: "schedule",
      date: "2099-07-30T12:00:00.000Z",
      integrationId: "account-1",
      provider: "tiktok",
      content: "Scheduled caption",
      sourceType: "slideshow",
      sourceId: "slideshow-scheduled",
      request: async () => ({ postIds: ["postfast-old"] }) as never,
    })
    const request = vi.fn(async (path: string) =>
      path === "/social-posts"
        ? ({ postIds: ["postfast-new"] } as never)
        : ({} as never)
    )
    const updated = await reschedulePost({
      record: original.record,
      scheduledFor: "2099-07-31T12:00:00.000Z",
      request,
    })

    expect(updated).toMatchObject({
      id: original.record.id,
      postfastPostId: "postfast-new",
      scheduledAt: "2099-07-31T12:00:00.000Z",
      status: "scheduled",
    })
    expect(state.posts).toHaveLength(1)
  })
})
