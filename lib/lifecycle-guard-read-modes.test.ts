import { afterEach, describe, expect, it, vi } from "vitest"

import { generatedVideoDeletionBlockReason } from "@/lib/generated-video-deletion"
import { slideshowDeletionBlockReason } from "@/lib/slideshow-lifecycle"

const mocks = vi.hoisted(() => ({
  legacy: vi.fn(),
  canonicalList: vi.fn(),
}))

vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: vi.fn(async () => "owner-1"),
  writeCanonicalPostWithLegacyProjection: vi.fn(),
}))

vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.legacy,
  addPostFastPostStatsSources: vi.fn(),
  deletePostFastPostRecordById: vi.fn(),
  putPostFastPostRecord: vi.fn(),
}))

vi.mock("@/lib/post-repository-appwrite", () => ({
  appwritePostRepository: {
    listPosts: mocks.canonicalList,
  },
}))

import { listPublicationRecordsForRead } from "@/lib/post-repository"

describe("publication lifecycle guards by read mode", () => {
  afterEach(() => {
    delete process.env.POST_REPOSITORY_READ_MODE
    vi.restoreAllMocks()
  })

  it("blocks the same output in all modes and returns legacy while shadowing drift", async () => {
    const legacy = {
      id: "post-1",
      sourceType: "generated_video" as const,
      sourceId: "video-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published" as const,
      linkState: "postfast_published" as const,
      statsSources: [],
      content: "Published video",
      media: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }
    const canonical = {
      schemaVersion: 1 as const,
      id: legacy.id,
      intentId: `legacy:${legacy.id}`,
      ownerId: "owner-1",
      origin: "postfast_publish" as const,
      sourceType: legacy.sourceType,
      sourceId: legacy.sourceId,
      sourceRefs: [
        { kind: "generated_video" as const, id: legacy.sourceId },
      ],
      outputId: legacy.sourceId,
      lifecycleStatus: "published" as const,
      linkState: "postfast_managed" as const,
      linkMethod: "postfast" as const,
      integrationId: legacy.integrationId,
      provider: "tiktok" as const,
      statsSources: [],
      content: legacy.content,
      hashtags: [],
      media: [],
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    }
    mocks.legacy.mockResolvedValue([legacy])
    mocks.canonicalList.mockResolvedValue([canonical])

    const reasons = []
    for (const mode of ["legacy", "canonical", "union-shadow"] as const) {
      process.env.POST_REPOSITORY_READ_MODE = mode
      const posts = await listPublicationRecordsForRead({
        surface: "generated_video_deletion_guard",
        filters: { sourceIds: ["video-1"] },
      })
      reasons.push(generatedVideoDeletionBlockReason("video-1", posts))
    }
    expect(reasons).toEqual(["published", "published", "published"])

    mocks.canonicalList.mockResolvedValue([
      { ...canonical, lifecycleStatus: "scheduled" as const },
    ])
    process.env.POST_REPOSITORY_READ_MODE = "union-shadow"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const posts = await listPublicationRecordsForRead({
      surface: "generated_video_deletion_guard",
      filters: { sourceIds: ["video-1"] },
    })
    expect(generatedVideoDeletionBlockReason("video-1", posts)).toBe(
      "published"
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"generated_video_deletion_guard"')
    )
  })

  it("uses explicit canonical source references for slideshow guards", async () => {
    process.env.POST_REPOSITORY_READ_MODE = "canonical"
    mocks.canonicalList.mockResolvedValue([
      {
        schemaVersion: 1,
        id: "post-2",
        intentId: "intent-2",
        ownerId: "owner-1",
        origin: "automation_generation",
        sourceType: "slideshow",
        sourceId: "legacy-alias",
        sourceRefs: [{ kind: "slideshow", id: "slideshow-1" }],
        outputId: "slideshow-1",
        lifecycleStatus: "scheduled",
        linkState: "postfast_managed",
        integrationId: "tiktok-1",
        provider: "tiktok",
        statsSources: [],
        content: "Scheduled slideshow",
        hashtags: [],
        media: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ])
    const posts = await listPublicationRecordsForRead({
      surface: "slideshow_deletion_guard",
      filters: { sourceIds: ["slideshow-1"] },
    })
    expect(
      slideshowDeletionBlockReason({
        slideshowStatus: "exported",
        runStatus: "succeeded",
        slideshowId: "slideshow-1",
        posts,
      })
    ).toBe("scheduled")
    expect(posts).toHaveLength(1)
  })
})
