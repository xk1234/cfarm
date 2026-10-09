import { describe, expect, it } from "vitest"

import {
  accountPostMetricSeries,
  findTikTokPostByPlatformId,
  latestPublicationsByPost,
  portfolioExposure,
  postExposureSeries,
  postMetricSeries,
  postPerformanceSeries,
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
      thumbnailUrl: "https://cdn.example.com/thumbnail.webp",
      media: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    }

    expect(latestPublicationsByPost([publication], [])).toEqual([
      expect.objectContaining({
        postId: publication.id,
        content: publication.content,
        thumbnailUrl: publication.thumbnailUrl,
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

  it("collapses historical internal ids for the same platform post", () => {
    const publication: PostFastPostRecord = {
      id: "current-publication",
      sourceType: "external",
      sourceId: "7662360324313517330",
      externalPostId: "7662360324313517330",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      linkState: "manually_linked",
      statsSources: ["tiktok_studio"],
      content: "The secrets a Cancer keeps",
      media: [],
      createdAt: "2026-08-02T14:09:45.155Z",
      updatedAt: "2026-08-02T14:22:43.689Z",
    }
    const snapshot = (
      id: string,
      postId: string,
      capturedAt: string,
      views: number
    ): PostFastMetricSnapshot => ({
      id,
      postId,
      platformPostId: "7662360324313517330",
      integrationId: "tiktok-1",
      provider: "tiktok",
      capturedAt,
      metrics: { views },
      latestMetric: { views },
      rawMetrics: { views },
      observedKeys: ["views"],
      source: "tiktok_studio",
    })

    const posts = latestPublicationsByPost(
      [publication],
      [
        snapshot(
          "historical",
          "former-internal-id",
          "2026-07-23T05:42:05.742Z",
          29_790
        ),
        snapshot("current", publication.id, "2026-08-02T14:21:56.652Z", 35_896),
      ]
    )

    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.objectContaining({
        id: "current",
        postId: publication.id,
        metrics: { views: 35_896 },
        publication,
        previous: expect.objectContaining({ id: "historical" }),
      })
    )
  })

  it("does not collapse the same platform id across different accounts", () => {
    const snapshot = (
      id: string,
      integrationId: string
    ): PostFastMetricSnapshot => ({
      id,
      postId: `post-${id}`,
      platformPostId: "shared-platform-id",
      integrationId,
      provider: "tiktok",
      capturedAt: "2026-08-02T14:21:56.652Z",
      metrics: { views: 1 },
      latestMetric: { views: 1 },
      rawMetrics: { views: 1 },
      observedKeys: ["views"],
      source: "tiktok_studio",
    })

    expect(
      latestPublicationsByPost(
        [],
        [snapshot("one", "tiktok-1"), snapshot("two", "tiktok-2")]
      )
    ).toHaveLength(2)
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
    expect(portfolioExposure(latestPublicationsByPost([], snapshots))).toEqual({
      label: "Total views",
      value: 50,
      availability: "2 of 2 posts",
    })
    expect(postExposureSeries(snapshots)).toEqual([
      expect.objectContaining({ date: "2026-07-30", value: 50 }),
    ])
    expect(postPerformanceSeries(snapshots, "views")).toEqual([
      expect.objectContaining({ date: "2026-07-30", value: 30 }),
    ])
  })

  it("uses TikTok Studio view buckets instead of repeated capture totals", () => {
    const studioSnapshot: PostFastMetricSnapshot = {
      id: "studio",
      postId: "post-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      capturedAt: "2026-08-02T14:21:56.652Z",
      metrics: { views: 35_900 },
      latestMetric: {},
      rawMetrics: {},
      observedKeys: ["videoViews"],
      source: "tiktok_studio",
      tiktokStudio: {
        schemaVersion: 1,
        studioUrl:
          "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
        capturedSections: ["overview"],
        slides: [],
        trafficSources: {},
        searchTerms: [],
        viewHistory7d: [
          { offset: 1, status: 0, value: 9_100 },
          { offset: 2, status: 0, value: 7_300 },
          { offset: 3, status: 0, value: 5_800 },
          { offset: 4, status: 0, value: 4_600 },
          { offset: 5, status: 0, value: 3_900 },
          { offset: 6, status: 0, value: 3_000 },
          { offset: 7, status: 0, value: 2_200 },
        ],
      },
    }

    expect(postPerformanceSeries([studioSnapshot], "views")).toEqual([
      { date: "0", label: "0d", value: 0 },
      { date: "1", label: "1d", value: 9_100 },
      { date: "2", label: "2d", value: 7_300 },
      { date: "3", label: "3d", value: 5_800 },
      { date: "4", label: "4d", value: 4_600 },
      { date: "5", label: "5d", value: 3_900 },
      { date: "6", label: "6d", value: 3_000 },
      { date: "7", label: "7d", value: 2_200 },
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
