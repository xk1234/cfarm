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

import {
  markOutputPostPublished,
  upsertGeneratedPostIntents,
  upsertPublicationPost,
} from "@/lib/post-writer"

beforeEach(() => {
  state.posts = []
  state.upsertPost.mockClear()
  vi.stubEnv("POST_REPOSITORY_WRITE_MODE", "canonical")
})

describe("generated post intents", () => {
  it("creates one ready intent per known destination and reuses it on retry", async () => {
    const input = {
      sourceType: "slideshow" as const,
      sourceId: "slideshow-1",
      outputId: "slideshow-1",
      automationId: "automation-1",
      runId: "run-1",
      content: "Caption",
      publishMode: "review" as const,
      destinations: [
        { integrationId: "account-1", provider: "tiktok" },
        { integrationId: "account-2", provider: "instagram" },
      ],
      generatedAt: "2026-07-30T12:00:00.000Z",
    }
    await upsertGeneratedPostIntents(input)
    await upsertGeneratedPostIntents(input)

    expect(state.posts).toHaveLength(2)
    expect(state.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          integrationId: "account-1",
          lifecycleStatus: "ready",
          publishMode: "review",
          outputId: "slideshow-1",
        }),
        expect.objectContaining({ integrationId: "account-2" }),
      ])
    )
  })

  it("creates one unassigned intent and lets the first destination fill it", async () => {
    const [unassigned] = await upsertGeneratedPostIntents({
      sourceType: "generated_video",
      sourceId: "video-1",
      outputId: "video-1",
      content: "Video",
      generatedAt: "2026-07-30T12:00:00.000Z",
    })
    const linked = await upsertPublicationPost({
      sourceType: "generated_video",
      sourceId: "video-1",
      outputId: "video-1",
      integrationId: "account-1",
      provider: "tiktok",
      status: "published",
      linkState: "postfast_published",
      postfastPostId: "postfast-1",
      content: "Video",
      media: [],
    })
    await upsertPublicationPost({
      sourceType: "generated_video",
      sourceId: "video-1",
      outputId: "video-1",
      integrationId: "account-2",
      provider: "instagram",
      status: "published",
      linkState: "postfast_published",
      postfastPostId: "postfast-2",
      content: "Video",
      media: [],
    })

    expect(linked.id).toBe(unassigned.id)
    expect(state.posts).toHaveLength(2)
  })

  it("does not add generated publication rows in default legacy mode", async () => {
    vi.stubEnv("POST_REPOSITORY_WRITE_MODE", "legacy")
    const posts = await upsertGeneratedPostIntents({
      sourceType: "slideshow",
      sourceId: "slideshow-legacy",
      outputId: "slideshow-legacy",
      content: "Legacy output",
    })

    expect(posts).toHaveLength(0)
    expect(state.upsertPost).not.toHaveBeenCalled()
    expect(state.posts).toEqual([])
  })

  it("creates a canonical manual-published intent while legacy stamps remain external", async () => {
    const post = await markOutputPostPublished({
      sourceType: "slideshow",
      sourceId: "slideshow-manual",
      outputId: "slideshow-manual",
      content: "Manual output",
      publishedAt: "2026-07-30T12:00:00.000Z",
    })

    expect(post).toMatchObject({
      lifecycleStatus: "published",
      linkState: "externally_linked",
      publishedAt: "2026-07-30T12:00:00.000Z",
    })
  })
})
