import { describe, expect, it, vi } from "vitest"

import {
  collectTikTokCommentsForPublication,
  TIKTOK_PLATFORM_POST_ID_REQUIRED,
} from "@/lib/tiktok-comment-collection-client"

describe("collectTikTokCommentsForPublication", () => {
  it("posts the local publication id and routes to the returned collection", async () => {
    const request = vi.fn().mockResolvedValue({
      collection: { id: "collection/one" },
    })
    const navigate = vi.fn()

    await collectTikTokCommentsForPublication(
      {
        id: "publication-1",
        platformPostId: "7662360324313517330",
      },
      { request, navigate }
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
    expect(navigate).toHaveBeenCalledWith(
      "/app/tiktok-comments?collectionId=collection%2Fone"
    )
  })

  it("refuses a publication without a platform post id", async () => {
    const request = vi.fn()
    const navigate = vi.fn()

    await expect(
      collectTikTokCommentsForPublication(
        { id: "publication-1" },
        { request, navigate }
      )
    ).rejects.toThrow(TIKTOK_PLATFORM_POST_ID_REQUIRED)
    expect(request).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
