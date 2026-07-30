import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRuns: vi.fn(),
  listGeneratedVideoExports: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  canonicalList: vi.fn(),
}))

vi.mock("@/lib/automation-runner", () => ({
  listAutomationRuns: mocks.listAutomationRuns,
}))
vi.mock("@/lib/generated-videos", () => ({
  listGeneratedVideoExports: mocks.listGeneratedVideoExports,
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

import { loadPublishedPostDates } from "@/lib/published-post-dates"

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.POST_REPOSITORY_READ_MODE
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listGeneratedVideoExports.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.canonicalList.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.POST_REPOSITORY_READ_MODE
})

describe("loadPublishedPostDates", () => {
  it("includes linked publication dates", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication({
        publishedAt: "2026-07-01T12:00:00.000Z",
      }),
      publication({
        id: "unlinked-publication",
        linkState: "unlinked",
        publishedAt: "2026-07-02T12:00:00.000Z",
      }),
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-01T12:00:00.000Z",
    ])
  })

  it("includes manual publish timestamps for runs and generated videos", async () => {
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        slideshowId: "slideshow-1",
        createdAt: "2026-06-01T09:00:00.000Z",
        manuallyPublishedAt: "2026-07-03T12:00:00.000Z",
      },
    ])
    mocks.listGeneratedVideoExports.mockResolvedValue([
      {
        id: "video-1",
        type: "template_video",
        createdAt: "2026-06-02T09:00:00.000Z",
        manuallyPublishedAt: "2026-07-04T12:00:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-03T12:00:00.000Z",
      "2026-07-04T12:00:00.000Z",
    ])
  })

  it("does not count a manually stamped run again when it has a publication", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication({
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        publishedAt: "2026-07-05T12:00:00.000Z",
      }),
    ])
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        slideshowId: "slideshow-1",
        manuallyPublishedAt: "2026-07-05T12:01:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-05T12:00:00.000Z",
    ])
  })

  // The publish path rewrites template_video to generated_video
  // (generated-video-exports.tsx), so the dedupe has to undo that rename.
  it("does not count a manually stamped video again when it has a publication", async () => {
    mocks.listPostFastPostRecords.mockResolvedValue([
      publication({
        sourceType: "generated_video",
        sourceId: "video-1",
        publishedAt: "2026-07-05T12:00:00.000Z",
      }),
    ])
    mocks.listGeneratedVideoExports.mockResolvedValue([
      {
        id: "video-1",
        type: "template_video",
        manuallyPublishedAt: "2026-07-05T12:01:00.000Z",
      },
      {
        id: "video-2",
        type: "greenscreen",
        manuallyPublishedAt: "2026-07-07T12:00:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-05T12:00:00.000Z",
      "2026-07-07T12:00:00.000Z",
    ])
  })

  it("keeps dates from healthy sources when another source fails", async () => {
    mocks.listPostFastPostRecords.mockRejectedValue(new Error("unavailable"))
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        manuallyPublishedAt: "2026-07-06T12:00:00.000Z",
      },
    ])

    await expect(loadPublishedPostDates()).resolves.toEqual([
      "2026-07-06T12:00:00.000Z",
    ])
  })

  it("preserves manual-stamp counts in all read modes and shadows drift", async () => {
    const linked = {
      id: "publication-mode-1",
      sourceType: "slideshow" as const,
      sourceId: "slideshow-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      linkState: "postfast_published",
      statsSources: [],
      content: "Published post",
      media: [],
      publishedAt: "2026-07-05T12:00:00.000Z",
      createdAt: "2026-07-05T12:00:00.000Z",
      updatedAt: "2026-07-05T12:00:00.000Z",
    }
    mocks.listPostFastPostRecords.mockResolvedValue([linked])
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        slideshowId: "slideshow-1",
        manuallyPublishedAt: "2026-07-05T12:01:00.000Z",
      },
    ])
    mocks.listGeneratedVideoExports.mockResolvedValue([
      {
        id: "video-unmatched",
        type: "template_video",
        manuallyPublishedAt: "2026-07-06T12:00:00.000Z",
      },
    ])
    const canonical = canonicalDashboardPost(linked)
    mocks.canonicalList.mockResolvedValue([canonical])

    const results = []
    for (const mode of ["legacy", "canonical", "union-shadow"] as const) {
      process.env.POST_REPOSITORY_READ_MODE = mode
      results.push(await loadPublishedPostDates())
    }
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
    expect(results[0]).toEqual([
      "2026-07-05T12:00:00.000Z",
      "2026-07-06T12:00:00.000Z",
    ])

    mocks.canonicalList.mockResolvedValue([
      { ...canonical, publishedAt: "2026-07-07T12:00:00.000Z" },
    ])
    process.env.POST_REPOSITORY_READ_MODE = "union-shadow"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    await expect(loadPublishedPostDates()).resolves.toEqual(results[0])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"dashboard_published_dates"')
    )
    warn.mockRestore()
  })
})

function publication(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "publication-1",
    sourceType: "automation",
    sourceId: "run-1",
    linkState: "postfast_published",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  }
}

function canonicalDashboardPost(publication: {
  id: string
  sourceType: "slideshow"
  sourceId: string
  integrationId: string
  provider: string
  content: string
  publishedAt: string
  createdAt: string
  updatedAt: string
}) {
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
    statsSources: [],
    content: publication.content,
    hashtags: [],
    media: [],
    publishedAt: publication.publishedAt,
    createdAt: publication.createdAt,
    updatedAt: publication.updatedAt,
  }
}
