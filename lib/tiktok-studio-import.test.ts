import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Post } from "@/lib/posts"
import type { PostFastPostRecord } from "@/lib/postfast-posts"

const mocks = vi.hoisted(() => ({
  batches: new Map<string, unknown>(),
  getPost: vi.fn(),
  imports: new Map<string, unknown>(),
  listPublications: vi.fn(),
  listSnapshots: vi.fn(),
  resolvePost: vi.fn(),
  upsertSnapshot: vi.fn(),
}))

vi.mock("@/lib/json-store", () => ({
  readJsonArrayRecord: vi.fn(async ({ fileName, id }) =>
    fileName.includes("batches") ? mocks.batches.get(id) : mocks.imports.get(id)
  ),
  readJsonArrayStore: vi.fn(async ({ fileName }) =>
    fileName.includes("batches")
      ? [...mocks.batches.values()]
      : [...mocks.imports.values()]
  ),
  upsertJsonArrayRecord: vi.fn(async ({ fileName, record }) => {
    const target = fileName.includes("batches") ? mocks.batches : mocks.imports
    target.set(record.id, record)
    return record
  }),
}))
vi.mock("@/lib/post-repository", () => ({
  getPost: mocks.getPost,
  listPublicationRecordsForRead: () => mocks.listPublications(),
  resolveOrCreateExternalPost: mocks.resolvePost,
}))
vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: vi.fn(async () => "owner-1"),
}))
vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPublications,
}))
vi.mock("@/lib/postfast-metric-snapshots", () => ({
  getMetricSnapshot: vi.fn(async () => null),
  listMetricSnapshots: mocks.listSnapshots,
  metricSnapshotId: vi.fn(
    (postId: string, capturedAt: string) => `${postId}:${capturedAt}`
  ),
  upsertMetricSnapshot: mocks.upsertSnapshot,
}))

import {
  createTikTokStudioAnalyticsBatch,
  createTikTokStudioAnalyticsDiscoveredBatch,
  createTikTokStudioAnalyticsImport,
  createTikTokStudioAnalyticsSeedBatch,
  getTikTokStudioCaptureManifest,
  ingestTikTokStudioAnalyticsCapture,
  linkTikTokStudioAnalyticsImport,
} from "@/lib/tiktok-studio-analytics"

describe("TikTok Studio import post materialization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.batches.clear()
    mocks.imports.clear()
    mocks.getPost.mockResolvedValue(null)
    mocks.listPublications.mockResolvedValue([])
    mocks.listSnapshots.mockResolvedValue([])
    mocks.resolvePost.mockImplementation(async (input) => post(input))
    mocks.upsertSnapshot.mockImplementation(async (snapshot) => snapshot)
    process.env.TIKTOK_STUDIO_CAPTURE_SECRET = "studio-import-test-secret"
  })

  it("materializes the explicit identity for a single existing post", async () => {
    mocks.getPost.mockResolvedValue(
      post({
        postId: "generated-post",
        externalPostId: "7662360324313517330",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
      })
    )

    const session = await createTikTokStudioAnalyticsImport({
      ownerId: "owner-1",
      postId: "generated-post",
      now: new Date("2026-07-30T00:00:00.000Z"),
    })

    expect(mocks.resolvePost).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        provider: "tiktok",
        postId: "generated-post",
        integrationId: "integration-1",
        externalPostId: "7662360324313517330",
      })
    )
    expect(session.import.targetPostId).toBe("generated-post")
  })

  it("materializes manifest candidates before account batch selection", async () => {
    mocks.listPublications.mockResolvedValue([
      publication({
        id: "published-post",
        externalPostId: "7662360324313517330",
      }),
    ])

    const session = await createTikTokStudioAnalyticsBatch({
      ownerId: "owner-1",
      integrationIds: ["integration-1"],
      mode: "all",
      now: new Date("2026-07-30T00:00:00.000Z"),
    })

    expect(mocks.resolvePost).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: "published-post",
        integrationId: "integration-1",
        externalPostId: "7662360324313517330",
      })
    )
    expect(session.batch.items).toEqual([
      expect.objectContaining({ targetPostId: "published-post" }),
    ])
  })

  it("creates a candidate from a pasted URL with no local output", async () => {
    const session = await createTikTokStudioAnalyticsSeedBatch({
      ownerId: "owner-1",
      integrationId: "integration-1",
      postReferences:
        "https://www.tiktok.com/@creator/video/7662360324313517330\n7662360324313517330",
      now: new Date("2026-07-30T00:00:00.000Z"),
    })

    expect(mocks.resolvePost).toHaveBeenCalledTimes(1)
    expect(mocks.resolvePost).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        provider: "tiktok",
        integrationId: "integration-1",
        externalPostId: "7662360324313517330",
      })
    )
    expect(session.batch.items).toHaveLength(1)
  })

  it("creates missing publications from posts discovered in Studio Content", async () => {
    const session = await createTikTokStudioAnalyticsDiscoveredBatch({
      ownerId: "owner-1",
      integrationId: "integration-1",
      posts: [
        {
          externalPostId: "7662360324313517330",
          releaseUrl:
            "https://www.tiktok.com/@creator/video/7662360324313517330",
          content: "Studio caption",
          publishedAt: "2026-07-29T08:30:00.000Z",
        },
        {
          externalPostId: "7662360324313517330",
          releaseUrl:
            "https://www.tiktok.com/@creator/video/7662360324313517330",
        },
      ],
      now: new Date("2026-07-30T00:00:00.000Z"),
    })

    expect(mocks.resolvePost).toHaveBeenCalledTimes(1)
    expect(mocks.resolvePost).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        provider: "tiktok",
        integrationId: "integration-1",
        externalPostId: "7662360324313517330",
        content: "Studio caption",
        publishedAt: "2026-07-29T08:30:00.000Z",
      })
    )
    expect(session.batch.items).toHaveLength(1)
  })

  it("re-resolves the scoped identity before linking a capture", async () => {
    const importRecord = {
      id: "import-1",
      status: "ready",
      targetPostId: "canonical-post",
      externalPostId: "7662360324313517330",
      integrationId: "integration-1",
      studioUrl:
        "https://www.tiktok.com/tiktokstudio/analytics/7662360324313517330/overview",
      createdAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2027-07-30T01:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      capturedSections: ["overview"],
      capture: {
        sections: ["overview"],
        overview: {
          authorUsername: "creator",
          caption: "Captured post",
          publishedAt: "2026-07-29T00:00:00.000Z",
          views: 10,
        },
        slides: [],
        trafficSources: {},
        searchTerms: [],
      },
    }
    mocks.imports.set(importRecord.id, importRecord)

    const linked = await linkTikTokStudioAnalyticsImport({
      importId: importRecord.id,
      now: new Date("2026-07-30T00:30:00.000Z"),
    })

    expect(mocks.resolvePost).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "tiktok",
        postId: "canonical-post",
        integrationId: "integration-1",
        externalPostId: "7662360324313517330",
        statsSources: ["tiktok_studio"],
      })
    )
    expect(mocks.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: "canonical-post",
        platformPostId: "7662360324313517330",
      })
    )
    expect(linked.import.status).toBe("linked")
  })

  it("captures and auto-links a newly seeded manifest post", async () => {
    const session = await createTikTokStudioAnalyticsSeedBatch({
      ownerId: "owner-1",
      integrationId: "integration-1",
      postReferences: "7662360324313517330",
      now: new Date(),
    })
    const item = session.batch.items[0]!
    await expect(
      getTikTokStudioCaptureManifest(session.captureToken)
    ).resolves.toMatchObject({
      posts: [
        {
          importId: item.id,
          postId: item.externalPostId,
          integrationId: "integration-1",
        },
      ],
    })

    const result = await ingestTikTokStudioAnalyticsCapture({
      token: session.captureToken,
      studioUrl: item.studioUrl,
      payload: {
        video_info: {
          aweme_id: item.externalPostId,
          desc: "Captured from Studio",
          create_time: 1784032298,
          author: { unique_id: "creator" },
          statistics: { play_count: 25 },
        },
      },
    })

    expect(result).toMatchObject({
      accepted: true,
      autoLinked: true,
      import: {
        targetPostId: item.targetPostId,
        integrationId: "integration-1",
        status: "linked",
      },
      snapshot: {
        postId: item.targetPostId,
        platformPostId: item.externalPostId,
      },
    })
  })
})

function post(
  input: {
    postId?: string
    ownerId?: string
    integrationId?: string
    externalPostId?: string
    sourceType?: Post["sourceType"]
    sourceId?: string
    origin?: Post["origin"]
    linkMethod?: Post["linkMethod"]
    releaseUrl?: string
    publishedAt?: string
    content?: string
    statsSources?: Post["statsSources"]
  } = {}
): Post {
  const externalPostId = input.externalPostId ?? "7662360324313517330"
  return {
    schemaVersion: 1,
    id: input.postId ?? `post-${externalPostId}`,
    intentId: `intent-${externalPostId}`,
    ownerId: input.ownerId ?? "owner-1",
    origin: input.origin ?? "tiktok_studio_import",
    sourceType: input.sourceType ?? "external",
    sourceId: input.sourceId ?? externalPostId,
    sourceRefs: [{ kind: "external", id: externalPostId }],
    lifecycleStatus: "published",
    linkState: "externally_linked",
    linkMethod: input.linkMethod ?? "tiktok_studio",
    integrationId: input.integrationId ?? "integration-1",
    provider: "tiktok",
    externalPostId,
    releaseUrl:
      input.releaseUrl ??
      `https://www.tiktok.com/@creator/video/${externalPostId}`,
    statsSources: input.statsSources ?? [],
    content: input.content ?? "",
    hashtags: [],
    media: [],
    publishedAt: input.publishedAt ?? "2026-07-29T00:00:00.000Z",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  }
}

function publication(
  overrides: Partial<PostFastPostRecord> = {}
): PostFastPostRecord {
  return {
    id: "published-post",
    sourceType: "external",
    sourceId: "7662360324313517330",
    integrationId: "integration-1",
    provider: "tiktok",
    status: "published",
    publishedAt: "2026-07-29T00:00:00.000Z",
    linkState: "manually_linked",
    statsSources: [],
    externalPostId: "7662360324313517330",
    content: "",
    media: [],
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  }
}
