import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Post } from "@/lib/posts"

const mocks = vi.hoisted(() => ({
  posts: [] as Post[],
  upsertPublicationPost: vi.fn(),
}))

vi.mock("@/lib/post-repository", () => ({
  postRepository: { listPosts: async () => mocks.posts },
}))
vi.mock("@/lib/post-writer", () => ({
  upsertPublicationPost: mocks.upsertPublicationPost,
}))
vi.mock("@/lib/publishing", () => ({
  enqueuePublishedCommentReminders: vi.fn(async () => []),
}))

import {
  linkPublishedOutput,
  ManualPublicationConflictError,
} from "@/lib/manual-publication-linking"

beforeEach(() => {
  mocks.posts = []
  mocks.upsertPublicationPost.mockReset()
  mocks.upsertPublicationPost.mockImplementation(async (input) => ({
    id: "publication-1",
    ...input,
    linkState: "manually_linked",
    statsSources: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  }))
})

describe("manual publication canonical writer", () => {
  it("maps a manual URL link to the shared repository upsert with legacy parity", async () => {
    const record = await linkPublishedOutput({
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      integrationId: "account-1",
      provider: "tiktok",
      releaseUrl:
        "https://www.tiktok.com/@creator/photo/7662360324313517330?share=1",
      publishedAt: "2026-07-30T12:00:00.000Z",
      content: "Caption",
      media: [],
    })

    expect(mocks.upsertPublicationPost).toHaveBeenCalledWith({
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      integrationId: "account-1",
      provider: "tiktok",
      status: "published",
      publishedAt: "2026-07-30T12:00:00.000Z",
      releaseUrl: "https://www.tiktok.com/@creator/photo/7662360324313517330",
      externalPostId: "7662360324313517330",
      linkState: "manually_linked",
      content: "Caption",
      media: [],
      origin: "manual_link",
      outputId: "slideshow-1",
    })
    expect(record).toMatchObject({
      status: "published",
      linkState: "manually_linked",
      externalPostId: "7662360324313517330",
    })
  })

  it("rejects a provider-scoped external identity already linked elsewhere", async () => {
    mocks.posts = [
      {
        schemaVersion: 1,
        id: "post-1",
        intentId: "intent-1",
        ownerId: "owner-1",
        origin: "manual_link",
        sourceType: "slideshow",
        sourceId: "slideshow-other",
        sourceRefs: [],
        lifecycleStatus: "published",
        linkState: "externally_linked",
        integrationId: "account-1",
        provider: "tiktok",
        externalPostId: "7662360324313517330",
        statsSources: [],
        content: "Other",
        hashtags: [],
        media: [],
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
    ]

    await expect(
      linkPublishedOutput({
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        integrationId: "account-1",
        provider: "tiktok",
        releaseUrl: "https://www.tiktok.com/@creator/photo/7662360324313517330",
        publishedAt: "2026-07-30T12:00:00.000Z",
        content: "Caption",
      })
    ).rejects.toBeInstanceOf(ManualPublicationConflictError)
    expect(mocks.upsertPublicationPost).not.toHaveBeenCalled()
  })
})
