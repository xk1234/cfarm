import { describe, expect, it, vi } from "vitest"

import {
  collectTikTokCommentsForPublication,
  TIKTOK_PLATFORM_POST_ID_REQUIRED,
} from "@/lib/tiktok-comment-collection-client"

describe("collectTikTokCommentsForPublication", () => {
  it("posts the local publication id and hands the collection to the extension", async () => {
    const companion = {
      version: 1 as const,
      endpoint: "https://lumenclip.example/api/tiktok-comments/capture",
      token: "signed-token",
      expiresAt: "2026-07-27T00:00:00.000Z",
    }
    const request = vi.fn().mockResolvedValue({
      collection: { id: "collection/one" },
      companion,
    })
    const connect = vi.fn().mockResolvedValue(undefined)

    await collectTikTokCommentsForPublication(
      {
        id: "publication-1",
        platformPostId: "7662360324313517330",
      },
      { request, connect }
    )

    expect(request).toHaveBeenCalledWith("/api/tiktok-comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "collect_start",
        postIds: ["publication-1"],
        scope: "topLevel",
      }),
      toastOnError: false,
    })
    expect(connect).toHaveBeenCalledWith(companion)
  })

  it("refuses a publication without a platform post id", async () => {
    const request = vi.fn()
    const connect = vi.fn()

    await expect(
      collectTikTokCommentsForPublication(
        { id: "publication-1" },
        { request, connect }
      )
    ).rejects.toThrow(TIKTOK_PLATFORM_POST_ID_REQUIRED)
    expect(request).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })
})
