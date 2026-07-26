import { describe, expect, it } from "vitest"

import { latestPublicationsByPost } from "@/components/realfarm/analytics/analytics-selectors"
import type { PostFastPostRecord } from "@/lib/postfast-posts"

describe("latestPublicationsByPost", () => {
  it("keeps publications that have no metric snapshot", () => {
    const publication: PostFastPostRecord = {
      id: "publication-1",
      sourceType: "external",
      sourceId: "source-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      linkState: "manually_linked",
      statsSources: [],
      content: "A snapshot-free post",
      media: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    }

    expect(latestPublicationsByPost([publication], [])).toEqual([
      expect.objectContaining({
        postId: publication.id,
        content: publication.content,
        metrics: {},
        publication,
      }),
    ])
  })
})
