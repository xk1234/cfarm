import { describe, expect, it, vi } from "vitest"

import { createTikTokCommentCollectionForDevice } from "@/lib/tiktok-comment-device"
import type { PostFastPostRecord } from "@/lib/postfast-posts"

describe("extension-owned TikTok comment collection", () => {
  it("starts a collection from the platform post visible in the extension", async () => {
    const createCollection = vi.fn(async () => ({
      collection: { id: "collection-1" },
      token: "comment-token",
    }))
    await createTikTokCommentCollectionForDevice(
      { ownerId: "owner-1", platformPostId: "7521234567890123456" },
      {
        listPublications: async () => [
          publication({ externalPostId: "7521234567890123456" }),
        ],
        createCollection: createCollection as never,
      }
    )

    expect(createCollection).toHaveBeenCalledWith({
      ownerId: "owner-1",
      postIds: ["post-1"],
      scope: "topLevel",
      maxComments: 100,
    })
  })

  it("matches an older publication by its TikTok URL", async () => {
    const createCollection = vi.fn(async () => ({
      collection: { id: "collection-1" },
      token: "comment-token",
    }))
    await createTikTokCommentCollectionForDevice(
      { ownerId: "owner-1", platformPostId: "7521234567890123456" },
      {
        listPublications: async () => [
          publication({
            releaseUrl:
              "https://www.tiktok.com/@lumenclip/photo/7521234567890123456",
          }),
        ],
        createCollection: createCollection as never,
      }
    )

    expect(createCollection).toHaveBeenCalledOnce()
  })

  it("does not create a collection for an unlinked TikTok", async () => {
    await expect(
      createTikTokCommentCollectionForDevice(
        { ownerId: "owner-1", platformPostId: "7521234567890123456" },
        {
          listPublications: async () => [],
          createCollection: vi.fn() as never,
        }
      )
    ).rejects.toThrow("not linked to a LumenClip publication")
  })
})

function publication(
  overrides: Partial<PostFastPostRecord>
): PostFastPostRecord {
  return {
    id: "post-1",
    sourceType: "external",
    sourceId: "external-post-1",
    integrationId: "integration-1",
    status: "published",
    linkState: "manually_linked",
    provider: "tiktok",
    statsSources: [],
    content: "",
    media: [],
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  }
}
