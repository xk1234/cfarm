import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { latestPublicationsByPost } from "@/components/realfarm/analytics/analytics-selectors"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type { PostFastPostRecord } from "@/lib/postfast-posts"

const mocks = vi.hoisted(() => ({
  listAnalyticsIntegrations: vi.fn(),
  listMetricSnapshots: vi.fn(),
  listFollowerSnapshots: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  canonicalList: vi.fn(),
}))

vi.mock("@/lib/postfast-analytics", () => ({
  listAnalyticsIntegrations: mocks.listAnalyticsIntegrations,
  syncPostFastAnalytics: vi.fn(),
}))

vi.mock("@/lib/postfast-metric-snapshots", () => ({
  listMetricSnapshots: mocks.listMetricSnapshots,
  listFollowerSnapshots: mocks.listFollowerSnapshots,
}))

vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))

vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: vi.fn(async () => "owner-1"),
  writeCanonicalPostWithLegacyProjection: vi.fn(),
}))

vi.mock("@/lib/post-repository-appwrite", () => ({
  appwritePostRepository: {
    listPosts: mocks.canonicalList,
  },
}))

import { GET } from "./route"

describe("analytics report", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.POST_REPOSITORY_READ_MODE
    mocks.listFollowerSnapshots.mockResolvedValue([])
    mocks.canonicalList.mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.POST_REPOSITORY_READ_MODE
  })

  it("resolves imported metrics for a manually linked publication", async () => {
    const capturedAt = new Date().toISOString()
    const publication: PostFastPostRecord = {
      id: "publication-manual-1",
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      integrationId: "manual-tiktok",
      provider: "tiktok",
      status: "published",
      publishedAt: capturedAt,
      releaseUrl: "https://www.tiktok.com/@creator/photo/123456789",
      linkState: "manually_linked",
      statsSources: ["tiktok_studio"],
      externalPostId: "123456789",
      content: "A hand-linked slideshow",
      media: [],
      createdAt: capturedAt,
      updatedAt: capturedAt,
    }
    const snapshot: PostFastMetricSnapshot = {
      id: "snapshot-studio-1",
      postId: publication.id,
      platformPostId: publication.externalPostId,
      integrationId: publication.integrationId,
      provider: "tiktok",
      capturedAt,
      publishedAt: capturedAt,
      content: publication.content,
      sourceType: publication.sourceType,
      sourceId: publication.sourceId,
      contentType: "slideshow",
      mediaCount: 3,
      metrics: { views: 321, engagementRate: 12.5 },
      latestMetric: {},
      rawMetrics: {},
      observedKeys: ["views", "engagementRate"],
      source: "tiktok_studio",
    }
    mocks.listAnalyticsIntegrations.mockResolvedValue([
      {
        integration_id: "connected-tiktok",
        provider: "tiktok",
        name: "Connected TikTok",
      },
    ])
    mocks.listMetricSnapshots.mockResolvedValue([snapshot])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])

    const response = await GET(
      new Request("http://localhost/api/analytics/report?days=30")
    )
    const payload = await response.json()
    const posts = latestPublicationsByPost(
      payload.publications,
      payload.snapshots
    )

    expect(posts).toEqual([
      expect.objectContaining({
        postId: publication.id,
        source: "tiktok_studio",
        metrics: expect.objectContaining({
          views: 321,
          engagementRate: 12.5,
        }),
        publication: expect.objectContaining({
          linkState: "manually_linked",
        }),
      }),
    ])
  })

  it("joins an orphan-safe external publication to its preserved snapshot id", async () => {
    const capturedAt = new Date().toISOString()
    const publication: PostFastPostRecord = {
      id: "preserved-orphan-post-id",
      sourceType: "external",
      sourceId: "native-external-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      publishedAt: capturedAt,
      linkState: "manually_linked",
      statsSources: ["tiktok_studio"],
      externalPostId: "native-external-1",
      content: "Studio-discovered post",
      media: [],
      createdAt: capturedAt,
      updatedAt: capturedAt,
    }
    const snapshot: PostFastMetricSnapshot = {
      id: "snapshot-external-1",
      postId: publication.id,
      platformPostId: publication.externalPostId,
      integrationId: publication.integrationId,
      provider: publication.provider,
      capturedAt,
      content: publication.content,
      sourceType: "external",
      sourceId: publication.sourceId,
      metrics: { views: 77 },
      latestMetric: { views: 77 },
      rawMetrics: { views: 77 },
      observedKeys: ["views"],
      source: "tiktok_studio",
    }
    mocks.listAnalyticsIntegrations.mockResolvedValue([])
    mocks.listMetricSnapshots.mockResolvedValue([snapshot])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])

    const response = await GET(
      new Request("http://localhost/api/analytics/report?days=30")
    )
    const payload = await response.json()
    const posts = latestPublicationsByPost(
      payload.publications,
      payload.snapshots
    )

    expect(posts).toEqual([
      expect.objectContaining({
        postId: "preserved-orphan-post-id",
        metrics: { views: 77 },
        publication: expect.objectContaining({
          id: "preserved-orphan-post-id",
          sourceType: "external",
        }),
      }),
    ])
  })

  it("keeps the analytics response stable in all read modes and shadows drift", async () => {
    const publishedAt = new Date().toISOString()
    const publication: PostFastPostRecord = {
      id: "mode-post-1",
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      publishedAt,
      linkState: "postfast_published",
      statsSources: ["postfast"],
      content: "Equivalent post",
      media: [],
      createdAt: publishedAt,
      updatedAt: publishedAt,
    }
    const canonical = canonicalPost(publication)
    mocks.listAnalyticsIntegrations.mockResolvedValue([
      {
        integration_id: "tiktok-1",
        provider: "tiktok",
        name: "TikTok",
      },
    ])
    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "mode-snapshot-1",
        postId: publication.id,
        integrationId: publication.integrationId,
        provider: publication.provider,
        capturedAt: publishedAt,
        metrics: { views: 42 },
        latestMetric: { views: 42 },
        rawMetrics: { views: 42 },
        observedKeys: ["views"],
        source: "postfast",
      },
    ])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])
    mocks.canonicalList.mockResolvedValue([canonical])

    const payloads = []
    for (const mode of ["legacy", "canonical", "union-shadow"] as const) {
      process.env.POST_REPOSITORY_READ_MODE = mode
      const response = await GET(
        new Request("http://localhost/api/analytics/report?days=30")
      )
      payloads.push(await response.json())
    }
    expect(payloads[1]).toEqual(payloads[0])
    expect(payloads[2]).toEqual(payloads[0])
    expect(
      latestPublicationsByPost(
        payloads[1].publications,
        payloads[1].snapshots
      )[0]
    ).toMatchObject({
      postId: publication.id,
      metrics: { views: 42 },
      publication: { id: publication.id },
    })

    mocks.canonicalList.mockResolvedValue([
      { ...canonical, content: "Canonical drift" },
    ])
    process.env.POST_REPOSITORY_READ_MODE = "union-shadow"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const response = await GET(
      new Request("http://localhost/api/analytics/report?days=30")
    )
    expect(await response.json()).toEqual(payloads[0])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"analytics_report"')
    )
    warn.mockRestore()
  })

  it("does not attach an out-of-window snapshot to a canonical post", async () => {
    const now = new Date()
    const publishedAt = now.toISOString()
    const oldCapturedAt = new Date(
      now.getTime() - 60 * 24 * 60 * 60 * 1000
    ).toISOString()
    const publication: PostFastPostRecord = {
      id: "window-post",
      sourceType: "slideshow",
      sourceId: "window-slideshow",
      integrationId: "tiktok-window",
      provider: "tiktok",
      status: "published",
      publishedAt,
      linkState: "postfast_published",
      statsSources: ["postfast"],
      content: "Current canonical post",
      media: [],
      createdAt: publishedAt,
      updatedAt: publishedAt,
    }
    mocks.canonicalList.mockResolvedValue([canonicalPost(publication)])
    mocks.listAnalyticsIntegrations.mockResolvedValue([
      {
        integration_id: publication.integrationId,
        provider: "tiktok",
        name: "TikTok",
      },
    ])
    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "old-snapshot",
        postId: publication.id,
        integrationId: publication.integrationId,
        provider: publication.provider,
        capturedAt: oldCapturedAt,
        metrics: { views: 999 },
        latestMetric: { views: 999 },
        rawMetrics: { views: 999 },
        observedKeys: ["views"],
        source: "postfast",
      },
    ])
    process.env.POST_REPOSITORY_READ_MODE = "canonical"

    const response = await GET(
      new Request("http://localhost/api/analytics/report?days=30")
    )
    const payload = await response.json()
    expect(payload.snapshots).toEqual([])
    expect(
      latestPublicationsByPost(payload.publications, payload.snapshots)[0]
        .metrics
    ).toEqual({})
  })
})

function canonicalPost(publication: PostFastPostRecord) {
  return {
    schemaVersion: 1 as const,
    id: publication.id,
    intentId: `legacy:${publication.id}`,
    ownerId: "owner-1",
    origin: "postfast_publish" as const,
    sourceType: publication.sourceType,
    sourceId: publication.sourceId,
    sourceRefs: [{ kind: "slideshow" as const, id: publication.sourceId }],
    lifecycleStatus: "published" as const,
    linkState: "postfast_managed" as const,
    linkMethod: "postfast" as const,
    integrationId: publication.integrationId,
    provider: "tiktok" as const,
    statsSources: publication.statsSources,
    content: publication.content,
    hashtags: [],
    media: [],
    publishedAt: publication.publishedAt,
    createdAt: publication.createdAt,
    updatedAt: publication.updatedAt,
  }
}
