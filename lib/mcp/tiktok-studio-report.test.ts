import { describe, expect, it } from "vitest"

import type { AutomationRunRecord } from "@/lib/automation-runner"
import {
  buildTikTokStudioMcpReport,
  type TikTokStudioReportServices,
} from "@/lib/mcp/tiktok-studio-report"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import type { SlideshowRecord } from "@/lib/slideshows"
import type { TikTokStudioImportRecord } from "@/lib/tiktok-studio-analytics"

describe("TikTok Studio MCP report", () => {
  it("joins linked Studio metrics to every persisted slideshow field", async () => {
    const report = await buildTikTokStudioMcpReport(
      reportInput(),
      services({
        publications: [slideshowPublication()],
        snapshots: [studioSnapshot()],
        runs: [slideshowRun()],
        slideshows: [slideshow()],
      })
    )

    expect(report.pagination).toMatchObject({
      total: 1,
      hasMore: false,
    })
    const post = report.posts[0]
    expect(post.publication).toMatchObject({
      externalPostId: "7662360324313517330",
      automationId: "automation-1",
      runId: "run-1",
    })
    expect(post.analytics).toMatchObject({
      state: "linked",
      capturedSections: ["overview", "engagement"],
      overview: { views: 1200, likes: 80 },
    })
    expect(post.history).toHaveLength(1)
    expect(post.output).toMatchObject({
      kind: "slideshow",
      id: "slideshow-1",
      title: "Cancer secrets",
      settings: {
        aspect_ratio: "9:16",
        duration: 2.9,
      },
    })
    expect(post.output?.kind).toBe("slideshow")
    if (post.output?.kind !== "slideshow") return
    expect(post.output.slides[0]).toMatchObject({
      index: 1,
      id: "slide-1",
      role: "hook",
      analytics: {
        retentionPercent: 1,
        likeDistributionPercent: 0.4,
      },
      text: {
        primary: "The secret a Cancer keeps",
        items: [
          {
            text: "The secret a Cancer keeps",
            textStyle: "outline",
            fontSize: "48",
          },
        ],
      },
      media: {
        imageUrl: "/api/local-assets/cancer.jpg",
        renderedImageUrl: "/api/local-assets/slide-1.png",
        imageCaption: "Moonlit portrait",
      },
      durationSeconds: 2.9,
    })
    expect(post.mapping).toMatchObject({
      outputResolved: true,
      outputSlideCount: 2,
      matchedSlideCount: 2,
      issues: [],
    })
  })

  it("returns complete generated-video configuration without secrets", async () => {
    const publication: PostFastPostRecord = {
      ...slideshowPublication(),
      id: "publication-video",
      sourceType: "generated_video",
      sourceId: "video-1",
      externalPostId: "7662360324313517999",
    }
    const snapshot: PostFastMetricSnapshot = {
      ...studioSnapshot(),
      id: "snapshot-video",
      postId: publication.id,
      platformPostId: publication.externalPostId,
      sourceType: "generated_video",
      sourceId: "video-1",
      contentType: "video",
      tiktokStudio: {
        ...studioSnapshot().tiktokStudio!,
        slides: [],
      },
    }
    const report = await buildTikTokStudioMcpReport(
      reportInput(),
      services({
        publications: [publication],
        snapshots: [snapshot],
        videos: [
          {
            id: "video-1",
            type: "template_video",
            status: "ready",
            createdAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:05:00.000Z",
            title: "Natal chart demo",
            description: "A complete walkthrough",
            hashtags: ["#astrology"],
            previewUrl: "/api/local-assets/video-preview.jpg",
            videoUrl: "/api/local-assets/video.mp4",
            sourceConfig: {
              automationId: "video-automation-1",
              scenes: [
                {
                  id: "intro",
                  durationSeconds: 8,
                  transcript: "Start with your rising sign.",
                },
              ],
              apiKey: "must-not-leak",
            },
          },
        ],
      })
    )

    const output = report.posts[0].output
    expect(output).toMatchObject({
      kind: "video",
      id: "video-1",
      automationId: "video-automation-1",
      videoUrl: "/api/local-assets/video.mp4",
      sourceConfig: {
        scenes: [
          {
            id: "intro",
            durationSeconds: 8,
            transcript: "Start with your rising sign.",
          },
        ],
      },
    })
    expect(
      output?.kind === "video" ? output.sourceConfig : undefined
    ).not.toHaveProperty("apiKey")
  })

  it("uses a pending import as the report scope and excludes unrelated posts", async () => {
    const pending: TikTokStudioImportRecord = {
      id: "import-1",
      status: "ready",
      targetPostId: "publication-1",
      externalPostId: "7662360324313517330",
      integrationId: "tiktok-1",
      studioUrl:
        "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:02:00.000Z",
      expiresAt: "2026-07-23T01:00:00.000Z",
      capturedSections: ["overview"],
      capture: {
        externalPostId: "7662360324313517330",
        sections: ["overview"],
        overview: { views: 1300, likes: 90 },
        slides: [{ slideIndex: 1, retentionPercent: 1 }],
        trafficSources: { "For You": 0.98 },
        searchTerms: [],
      },
    }
    const unrelated = {
      ...studioSnapshot(),
      id: "snapshot-unrelated",
      postId: "publication-unrelated",
      platformPostId: "7000000000000000000",
    }
    const report = await buildTikTokStudioMcpReport(
      { ...reportInput(), importId: pending.id },
      services({
        publications: [slideshowPublication()],
        snapshots: [studioSnapshot(), unrelated],
        imports: [pending],
        runs: [slideshowRun()],
        slideshows: [slideshow()],
      })
    )

    expect(report.pagination.total).toBe(1)
    expect(report.posts[0].analytics).toMatchObject({
      state: "ready",
      importId: "import-1",
      readyToLink: true,
      overview: { views: 1300, likes: 90 },
    })
  })

  it("keeps richer sections when a newer snapshot only captured overview", async () => {
    const richer = {
      ...studioSnapshot(),
      id: "snapshot-rich",
      capturedAt: "2026-07-23T05:42:00.000Z",
      tiktokStudio: {
        ...studioSnapshot().tiktokStudio!,
        capturedSections: [
          "overview",
          "viewers",
          "engagement",
        ] as Array<"overview" | "viewers" | "engagement">,
        slides: [
          {
            slideIndex: 1,
            retentionPercent: 1,
            likeDistributionPercent: 0.4,
          },
          {
            slideIndex: 2,
            retentionPercent: 0.6,
            likeDistributionPercent: 0.6,
          },
        ],
        audience: {
          uniqueViewers: 900,
          agePercent: { "25-34": 0.5 },
          genderPercent: { Female: 0.6 },
          countryPercent: { US: 0.4 },
        },
      },
    }
    const overviewOnly = {
      ...studioSnapshot(),
      id: "snapshot-overview",
      capturedAt: "2026-07-23T12:04:00.000Z",
      metrics: { views: 1300, likes: 90, interactions: 105 },
      rawMetrics: { videoViews: 1300, likes: 90 },
      tiktokStudio: {
        ...studioSnapshot().tiktokStudio!,
        capturedSections: ["overview"] as Array<
          "overview" | "viewers" | "engagement"
        >,
        overview: { views: 1300, likes: 90 },
        slides: [
          { slideIndex: 1, retentionPercent: 1 },
          { slideIndex: 2, retentionPercent: 0.55 },
        ],
        audience: undefined,
      },
    }
    const report = await buildTikTokStudioMcpReport(
      reportInput(),
      services({
        publications: [slideshowPublication()],
        snapshots: [richer, overviewOnly],
        runs: [slideshowRun()],
        slideshows: [slideshow()],
      })
    )

    expect(report.posts[0].analytics).toMatchObject({
      snapshotId: "snapshot-overview",
      capturedSections: ["overview", "viewers", "engagement"],
      isCurrentPartial: true,
      missingCurrentSections: ["viewers", "engagement"],
      currentSnapshot: {
        snapshotId: "snapshot-overview",
        partial: true,
      },
      metrics: { views: 1300, likes: 90 },
      audience: { uniqueViewers: 900 },
      slides: [
        { slideIndex: 1, retentionPercent: 1, likeDistributionPercent: 0.4 },
        {
          slideIndex: 2,
          retentionPercent: 0.55,
          likeDistributionPercent: 0.6,
        },
      ],
    })
    expect(report.posts[0].history[0]).toMatchObject({
      snapshotId: "snapshot-overview",
      partial: true,
      missingSections: ["viewers", "engagement"],
    })
  })

  it("reports slide shells as unavailable instead of claiming a healthy mapping", async () => {
    const emptySlides = {
      ...studioSnapshot(),
      tiktokStudio: {
        ...studioSnapshot().tiktokStudio!,
        slides: [{ slideIndex: 1 }, { slideIndex: 2 }],
      },
    }
    const report = await buildTikTokStudioMcpReport(
      reportInput(),
      services({
        publications: [slideshowPublication()],
        snapshots: [emptySlides],
        runs: [slideshowRun()],
        slideshows: [slideshow()],
      })
    )

    expect(report.posts[0].analytics.slideMetricsAvailability).toEqual({
      status: "unavailable",
      slideCount: 2,
      retentionCount: 0,
      likeDistributionCount: 0,
      missingRetentionSlideIndexes: [1, 2],
      missingLikeDistributionSlideIndexes: [1, 2],
    })
    expect(report.posts[0].mapping.issues).toContain(
      "Studio returned slide indexes but no retention or like-distribution values; slide-level performance is unavailable for this capture."
    )
  })
})

function reportInput() {
  return {
    days: 365,
    offset: 0,
    limit: 20,
    historyLimit: 3,
    now: new Date("2026-07-23T00:00:00.000Z"),
  }
}

function services(input: {
  publications?: PostFastPostRecord[]
  snapshots?: PostFastMetricSnapshot[]
  runs?: AutomationRunRecord[]
  slideshows?: SlideshowRecord[]
  videos?: Awaited<
    ReturnType<TikTokStudioReportServices["listGeneratedVideoExports"]>
  >
  imports?: TikTokStudioImportRecord[]
}): TikTokStudioReportServices {
  return {
    listPostFastPostRecords: async () => input.publications ?? [],
    listMetricSnapshots: async () => input.snapshots ?? [],
    listAutomationRuns: async () => input.runs ?? [],
    listSlideshowRecords: async () => input.slideshows ?? [],
    listGeneratedVideoExports: async () => input.videos ?? [],
    inspectTikTokStudioAnalyticsImport: async (id) => {
      const record = input.imports?.find((item) => item.id === id)
      if (!record) throw new Error("Import not found")
      return record
    },
    inspectTikTokStudioAnalyticsBatch: async () => ({
      items: (input.imports ?? []).map((item) => ({ id: item.id })),
    }),
  }
}

function slideshowPublication(): PostFastPostRecord {
  return {
    id: "publication-1",
    sourceType: "slideshow",
    sourceId: "slideshow-1",
    integrationId: "tiktok-1",
    provider: "tiktok",
    status: "published",
    publishedAt: "2026-07-20T00:00:00.000Z",
    releaseUrl: "https://www.tiktok.com/@horoiq/photo/7662360324313517330",
    externalPostId: "7662360324313517330",
    content: "The secret a Cancer keeps",
    media: [],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  }
}

function studioSnapshot(): PostFastMetricSnapshot {
  return {
    id: "snapshot-1",
    postId: "publication-1",
    platformPostId: "7662360324313517330",
    integrationId: "tiktok-1",
    provider: "tiktok",
    capturedAt: "2026-07-22T00:00:00.000Z",
    publishedAt: "2026-07-20T00:00:00.000Z",
    content: "The secret a Cancer keeps",
    releaseUrl: "https://www.tiktok.com/@horoiq/photo/7662360324313517330",
    sourceType: "slideshow",
    sourceId: "slideshow-1",
    contentType: "slideshow",
    mediaCount: 2,
    metrics: {
      views: 1200,
      likes: 80,
      interactions: 95,
    },
    latestMetric: {},
    rawMetrics: {
      videoViews: 1200,
      likes: 80,
      comments: 5,
      shares: 4,
      saves: 6,
    },
    observedKeys: ["videoViews", "likes", "comments", "shares", "saves"],
    source: "tiktok_studio",
    tiktokStudio: {
      schemaVersion: 1,
      studioUrl:
        "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
      capturedSections: ["overview", "engagement"],
      overview: { views: 1200, likes: 80 },
      slides: [
        {
          slideIndex: 1,
          retentionPercent: 1,
          likeDistributionPercent: 0.4,
        },
        {
          slideIndex: 2,
          retentionPercent: 0.6,
          likeDistributionPercent: 0.6,
        },
      ],
      trafficSources: { "For You": 0.98 },
      searchTerms: [{ term: "cancer zodiac", percent: 0.2 }],
    },
  }
}

function slideshowRun(): AutomationRunRecord {
  return {
    id: "run-1",
    automationId: "automation-1",
    automationTitle: "Astrology informational",
    scheduledFor: "2026-07-20T00:00:00.000Z",
    status: "succeeded",
    slideshowId: "slideshow-1",
    plan: {
      title: "Cancer secrets",
      caption: "The secret a Cancer keeps",
      hashtags: "#astrology",
      hook: "The secret a Cancer keeps",
      imageCollectionIds: ["collection-1"],
      slides: [
        {
          id: "slide-1",
          role: "hook",
          imageUrl: "/api/local-assets/cancer.jpg",
          imageCaption: "Moonlit portrait",
          imageKey: "cancer.jpg",
          text: "The secret a Cancer keeps",
          textPlacement: "top",
        },
        {
          id: "slide-2",
          role: "content",
          imageUrl: "/api/local-assets/moon.jpg",
          imageCaption: "Full moon",
          imageKey: "moon.jpg",
          text: "They remember every emotional detail.",
          textPlacement: "center",
        },
      ],
      slideCount: { mode: "fixed", count: 2 },
      publishType: "manual",
      autoMusic: false,
      autoPost: false,
      language: "en",
    },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:05:00.000Z",
  }
}

function slideshow(): SlideshowRecord {
  return {
    id: "slideshow-1",
    runId: "run-1",
    automationId: "automation-1",
    title: "Cancer secrets",
    caption: "The secret a Cancer keeps",
    hashtags: "#astrology",
    prompt: "Explain Cancer traits",
    image_collection: "collection-1",
    slideshow_type: "educational",
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:05:00.000Z",
    settings: {
      duration: 2.9,
      aspect_ratio: "9:16",
      font: "TikTok Display Medium",
      background_color: "#000000",
      transition_style: "none",
      export_as_video: false,
      sound_id: "",
      sound_name: "",
      sound_url: "",
    },
    images: [
      {
        id: "slide-1",
        image_url: "/api/local-assets/cancer.jpg",
        textItems: [
          {
            id: "text-1",
            text: "The secret a Cancer keeps",
            fontSize: "48",
            textSize: { width: 80, height: 20 },
            textStyle: "outline",
            textPlacement: "top",
            textPosition: { x: 50, y: 15 },
          },
        ],
      },
      {
        id: "slide-2",
        image_url: "/api/local-assets/moon.jpg",
        textItems: [
          {
            id: "text-2",
            text: "They remember every emotional detail.",
            fontSize: "42",
            textSize: { width: 80, height: 25 },
            textStyle: "plain",
            textPlacement: "center",
            textPosition: { x: 50, y: 50 },
          },
        ],
      },
    ],
    status: "exported",
    output_images: [
      "/api/local-assets/slide-1.png",
      "/api/local-assets/slide-2.png",
    ],
    thumbnail_url: "/api/local-assets/slide-1.png",
  }
}
