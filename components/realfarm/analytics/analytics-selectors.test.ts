import { describe, expect, it } from "vitest"

import {
  accountPostMetricSeries,
  findTikTokPostByPlatformId,
  latestPublicationsByPost,
  postMetricSeries,
} from "@/components/realfarm/analytics/analytics-selectors"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
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

  it("joins a materialized external post by the snapshot's preserved post id", () => {
    const publication: PostFastPostRecord = {
      id: "orphan-post-id",
      sourceType: "external",
      sourceId: "native-1",
      externalPostId: "native-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      linkState: "manually_linked",
      statsSources: ["tiktok_studio"],
      content: "Studio post",
      media: [],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    }
    const snapshot: PostFastMetricSnapshot = {
      id: "snapshot-1",
      postId: "orphan-post-id",
      platformPostId: "native-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      capturedAt: "2026-07-30T01:00:00.000Z",
      metrics: { views: 42 },
      latestMetric: { views: 42 },
      rawMetrics: { views: 42 },
      observedKeys: ["views"],
      source: "tiktok_studio",
    }

    expect(latestPublicationsByPost([publication], [snapshot])).toEqual([
      expect.objectContaining({
        postId: "orphan-post-id",
        metrics: { views: 42 },
        publication,
      }),
    ])
  })

  it("keeps only the latest snapshot per post/day and weights engagement by exposure", () => {
    const snapshot = (
      id: string,
      postId: string,
      capturedAt: string,
      views: number,
      interactions: number
    ): PostFastMetricSnapshot => ({
      id,
      postId,
      integrationId: "tiktok-1",
      provider: "tiktok",
      capturedAt,
      metrics: { views, interactions },
      latestMetric: {},
      rawMetrics: {},
      observedKeys: ["views", "interactions"],
      source: "postfast",
    })
    const snapshots = [
      snapshot("early", "post-1", "2026-07-30T01:00:00.000Z", 10, 9),
      snapshot("latest", "post-1", "2026-07-30T02:00:00.000Z", 20, 2),
      snapshot("other", "post-2", "2026-07-30T03:00:00.000Z", 30, 6),
    ]

    expect(postMetricSeries(snapshots, "views")).toEqual([
      expect.objectContaining({ date: "2026-07-30", value: 50 }),
    ])
    expect(accountPostMetricSeries(snapshots, "engagementRate")).toEqual([
      expect.objectContaining({ date: "2026-07-30", value: 16 }),
    ])
  })
})

describe("findTikTokPostByPlatformId", () => {
  it("finds a TikTok publication by native id or video URL", () => {
    const posts = latestPublicationsByPost(
      [
        {
          id: "publication-1",
          sourceType: "external",
          sourceId: "source-1",
          externalPostId: "7669076017918561554",
          integrationId: "tiktok-1",
          provider: "tiktok",
          status: "published",
          linkState: "manually_linked",
          statsSources: [],
          content: "A linked video",
          releaseUrl:
            "https://www.tiktok.com/@horoiq/photo/7669076017918561554?image_index=2",
          media: [],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
        },
      ],
      []
    )

    expect(
      findTikTokPostByPlatformId(posts, "7669076017918561554")?.postId
    ).toBe("publication-1")
    expect(findTikTokPostByPlatformId(posts, "missing")).toBeUndefined()
  })
})
