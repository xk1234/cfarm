import { describe, expect, it } from "vitest"

import {
  canonicalTikTokPostUrl,
  captureOwnerId,
  createTikTokStudioDeviceAuthorization,
  mergeTikTokStudioParsedCaptures,
  parseTikTokStudioInsightPayload,
  selectTikTokStudioBatchPublications,
} from "@/lib/tiktok-studio-analytics"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type { PostFastPostRecord } from "@/lib/postfast-posts"

describe("TikTok Studio analytics parser", () => {
  it("builds canonical public post URLs from captured Studio metadata", () => {
    expect(
      canonicalTikTokPostUrl({
        externalPostId: "7662360324313517330",
        authorUsername: "@horoiq",
        photoCount: 9,
      })
    ).toBe("https://www.tiktok.com/@horoiq/photo/7662360324313517330")
    expect(
      canonicalTikTokPostUrl({
        externalPostId: "7662360324313517331",
        authorUsername: "horoiq",
      })
    ).toBe("https://www.tiktok.com/@horoiq/video/7662360324313517331")
    expect(
      canonicalTikTokPostUrl({
        externalPostId: "not-a-post",
        authorUsername: "Display Name",
        photoCount: 4,
      })
    ).toBeUndefined()
  })

  it("parses overview and per-slide photo metrics from Studio insight JSON", () => {
    const parsed = parseTikTokStudioInsightPayload({
      data: {
        video_info: {
          value: {
            aweme_id: "7662360324313517330",
            create_time: 1784032298,
            desc: "The secrets a Cancer keeps",
            author: { unique_id: "horoiq" },
            image_post_info: {
              images: [{}, {}, {}, {}],
            },
            statistics: {
              play_count: 29783,
              digg_count: 1101,
              comment_count: 17,
              share_count: 74,
              collect_count: 405,
            },
          },
        },
        video_total_duration_realtime: { value: { value: 616396 } },
        video_per_duration_realtime: { value: { value: 21.12 } },
        video_finish_rate_realtime: { value: { value: 0.4293 } },
        video_new_followers: { value: 29 },
        photo_retention_percent: {
          value: {
            1: 1,
            2: 0.7536052740008241,
            3: 0.6271528636176349,
            4: 0.5278533168520808,
          },
        },
        photo_retention_drop: { value: 2 },
        video_traffic_source_percent_realtime: {
          value: {
            value: {
              for_you: 0.989,
              others: 0.006,
              personal_profile: 0.004,
              direct_message: 0.001,
            },
          },
        },
        item_search_terms: {
          value: [
            { search_term: "cancer meaning", percent: 0.125 },
            { search_term: "cancer venus", percent: 0.125 },
          ],
        },
      },
    })

    expect(parsed.externalPostId).toBe("7662360324313517330")
    expect(parsed.sections).toContain("overview")
    expect(parsed.overview).toMatchObject({
      authorUsername: "horoiq",
      views: 29783,
      likes: 1101,
      comments: 17,
      shares: 74,
      saves: 405,
      totalWatchTimeSeconds: 616396,
      averageWatchTimeSeconds: 21.12,
      fullWatchPercent: 0.4293,
      newFollowers: 29,
      photoCount: 4,
    })
    expect(parsed.slides).toEqual([
      expect.objectContaining({
        slideIndex: 1,
        retentionPercent: 1,
      }),
      expect.objectContaining({
        slideIndex: 2,
        retentionPercent: 0.7536052740008241,
        isRetentionDropPeak: true,
      }),
      expect.objectContaining({
        slideIndex: 3,
        retentionPercent: 0.6271528636176349,
      }),
      expect.objectContaining({
        slideIndex: 4,
        retentionPercent: 0.5278533168520808,
      }),
    ])
    expect(parsed.trafficSources).toMatchObject({
      "For You": 0.989,
      Others: 0.006,
    })
    expect(parsed.searchTerms).toEqual([
      { term: "cancer meaning", percent: 0.125 },
      { term: "cancer venus", percent: 0.125 },
    ])
  })

  it("merges the viewers and engagement shapes exposed by Studio tabs", () => {
    const viewers = parseTikTokStudioInsightPayload({
      data: {
        video_uv: { value: 26494 },
        video_viewer_new_viewer_percent: { value: 0.99 },
        video_viewer_return_viewer_percent: { value: 0.01 },
        video_viewer_follower_percent: { value: 0 },
        video_viewer_non_follower_percent: { value: 1 },
        video_viewer_age_percent_realtime: {
          value: {
            value: {
              age_18_24: 0.08,
              age_25_34: 0.31,
              age_35_44: 0.34,
            },
          },
        },
        video_viewer_gender_percent_realtime: {
          value: {
            value: { female_vv: 0.57, male_vv: 0.43, other_vv: 0 },
          },
        },
        video_viewer_location_percent_realtime: {
          value: {
            country_percent_list: [
              { country_name: "United States", percent: 0.326 },
              { country_name: "Philippines", percent: 0.1 },
            ],
          },
        },
      },
    })
    const engagement = parseTikTokStudioInsightPayload({
      data: {
        photo_like_distribution: {
          value: {
            1: 0.14891416752843847,
            2: 0.3505687693898656,
            3: 0.11995863495346432,
            4: 0.38055842812823165,
          },
        },
        photo_like_peak: { value: 4 },
        video_like_distribution_realtime: { value: { status: 2 } },
      },
    })

    expect(viewers.sections).toEqual(["viewers"])
    expect(viewers.audience).toMatchObject({
      uniqueViewers: 26494,
      newViewerPercent: 0.99,
      returningViewerPercent: 0.01,
      followerPercent: 0,
      nonFollowerPercent: 1,
      genderPercent: {
        Female: 0.57,
        Male: 0.43,
        Other: 0,
      },
      countryPercent: {
        "United States": 0.326,
        Philippines: 0.1,
      },
    })
    expect(engagement.sections).toEqual(["engagement"])
    expect(engagement.slides[3]).toMatchObject({
      slideIndex: 4,
      likeDistributionPercent: 0.38055842812823165,
      isLikePeak: true,
    })

    const overview = parseTikTokStudioInsightPayload({
      video_info: {
        aweme_id: "7662360324313517330",
        image_post_info: { images: [{}, {}, {}, {}] },
      },
      photo_retention_percent: {
        value: [
          { key: "1", value: 1 },
          { key: "2", value: 0.75 },
          { key: "3", value: 0.62 },
          { key: "4", value: 0.52 },
        ],
      },
    })
    const merged = mergeTikTokStudioParsedCaptures(
      mergeTikTokStudioParsedCaptures(overview, viewers),
      engagement
    )
    expect(merged.slides[3]).toMatchObject({
      slideIndex: 4,
      retentionPercent: 0.52,
      likeDistributionPercent: 0.38055842812823165,
      isLikePeak: true,
    })
  })
})

describe("TikTok Studio account sync selection", () => {
  const now = new Date("2026-07-23T00:00:00.000Z")
  const publications = [
    publication("post-new", "7662360324313517330", "2026-07-20T00:00:00.000Z"),
    publication(
      "post-synced",
      "7662468104336755975",
      "2026-07-18T00:00:00.000Z"
    ),
    publication("post-old", "7662786714183748871", "2025-01-01T00:00:00.000Z"),
    publication(
      "post-other-account",
      "7663545501639265554",
      "2026-07-21T00:00:00.000Z",
      "tiktok-other"
    ),
  ]
  const snapshots = [
    {
      id: "studio-snapshot",
      postId: "post-synced",
      platformPostId: "7662468104336755975",
      integrationId: "tiktok-main",
      provider: "tiktok",
      capturedAt: "2026-07-19T00:00:00.000Z",
      metrics: {},
      latestMetric: {},
      rawMetrics: {},
      observedKeys: [],
      source: "tiktok_studio",
    },
  ] satisfies PostFastMetricSnapshot[]

  it("selects only linked posts that do not have a Studio snapshot", () => {
    const selected = selectTikTokStudioBatchPublications({
      publications,
      snapshots,
      integrationIds: ["tiktok-main"],
      mode: "new",
      now,
    })
    expect(selected.map((item) => item.id)).toEqual(["post-new", "post-old"])
  })

  it("applies account and recent-date scope before building the allowlist", () => {
    const selected = selectTikTokStudioBatchPublications({
      publications,
      snapshots,
      integrationIds: ["tiktok-main"],
      mode: "recent",
      recentDays: 90,
      now,
    })
    expect(selected.map((item) => item.id)).toEqual(["post-new", "post-synced"])
  })
})

describe("TikTok Studio companion authorization", () => {
  it("issues a durable capture-only device credential for one owner", () => {
    const previous = process.env.TIKTOK_STUDIO_CAPTURE_SECRET
    process.env.TIKTOK_STUDIO_CAPTURE_SECRET = "test-device-secret"
    try {
      const authorization = createTikTokStudioDeviceAuthorization({
        ownerId: "owner-123",
        now: new Date(),
      })

      expect(captureOwnerId(authorization.captureToken)).toBe("owner-123")
      expect(Date.parse(authorization.expiresAt) - Date.now()).toBeGreaterThan(
        360 * 24 * 60 * 60 * 1000
      )
    } finally {
      process.env.TIKTOK_STUDIO_CAPTURE_SECRET = previous
    }
  })
})

function publication(
  id: string,
  externalPostId: string,
  publishedAt: string,
  integrationId = "tiktok-main"
): PostFastPostRecord {
  return {
    id,
    sourceType: "slideshow",
    sourceId: id,
    integrationId,
    provider: "tiktok",
    status: "published",
    externalPostId,
    releaseUrl: `https://www.tiktok.com/@horoiq/photo/${externalPostId}`,
    content: "",
    media: [],
    createdAt: publishedAt,
    updatedAt: publishedAt,
    publishedAt,
  }
}
