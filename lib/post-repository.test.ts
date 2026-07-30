import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PostFastPostRecord } from "@/lib/postfast-posts"

const mocks = vi.hoisted(() => ({
  records: [] as PostFastPostRecord[],
  addStatsSources: vi.fn(),
  ownerId: vi.fn(),
  putRecord: vi.fn(),
}))

vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: mocks.ownerId,
}))

vi.mock("@/lib/postfast-posts", () => ({
  addPostFastPostStatsSources: mocks.addStatsSources,
  listPostFastPostRecords: vi.fn(async () => mocks.records),
  putPostFastPostRecord: mocks.putRecord,
}))

import {
  ensurePostForSnapshot,
  PostIdentityConflictError,
  resolveOrCreateExternalPost,
} from "@/lib/post-repository"

describe("legacy-backed post repository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.records = []
    mocks.ownerId.mockResolvedValue("owner-1")
    mocks.putRecord.mockImplementation(async (record: PostFastPostRecord) => {
      mocks.records = [
        record,
        ...mocks.records.filter((item) => item.id !== record.id),
      ]
      return record
    })
  })

  it("preserves an orphan snapshot post id and is idempotent", async () => {
    const snapshot = snapshotSeed({
      postId: "orphan-snapshot-post-1",
      platformPostId: "native-1",
      source: "tiktok_studio",
    })

    const first = await ensurePostForSnapshot(snapshot)
    const second = await ensurePostForSnapshot(snapshot)

    expect(first).toMatchObject({
      id: "orphan-snapshot-post-1",
      intentId: "legacy:orphan-snapshot-post-1",
      origin: "tiktok_studio_import",
      sourceType: "external",
      sourceId: "native-1",
      lifecycleStatus: "published",
      integrationId: "integration-1",
      externalPostId: "native-1",
    })
    expect(second.id).toBe(first.id)
    expect(mocks.records).toHaveLength(1)
    expect(mocks.records[0]).toMatchObject({
      id: snapshot.postId,
      sourceType: "external",
      sourceId: "native-1",
      integrationId: "integration-1",
      status: "published",
    })
  })

  it("uses an existing scoped external claim as the canonical id", async () => {
    mocks.records = [
      legacyRecord({
        id: "canonical-post-1",
        externalPostId: "native-1",
      }),
    ]

    const post = await ensurePostForSnapshot(
      snapshotSeed({
        postId: "remote-proposed-id",
        platformPostId: "native-1",
      })
    )

    expect(post.id).toBe("canonical-post-1")
    expect(mocks.records).toHaveLength(1)
  })

  it("rejects a snapshot id that conflicts with an external identity claim", async () => {
    mocks.records = [
      legacyRecord({
        id: "snapshot-post-id",
        externalPostId: "native-a",
      }),
      legacyRecord({
        id: "other-canonical-post",
        externalPostId: "native-b",
      }),
    ]

    await expect(
      ensurePostForSnapshot(
        snapshotSeed({
          postId: "snapshot-post-id",
          platformPostId: "native-b",
        })
      )
    ).rejects.toBeInstanceOf(PostIdentityConflictError)
    expect(mocks.putRecord).not.toHaveBeenCalled()
  })

  it("does not collapse the same external id across integrations", async () => {
    mocks.records = [
      legacyRecord({
        id: "account-2-post",
        integrationId: "integration-2",
        externalPostId: "native-1",
      }),
    ]

    const post = await ensurePostForSnapshot(
      snapshotSeed({
        postId: "account-1-post",
        platformPostId: "native-1",
      })
    )

    expect(post.id).toBe("account-1-post")
    expect(mocks.records.map((record) => record.id).sort()).toEqual([
      "account-1-post",
      "account-2-post",
    ])
  })

  it("creates one external TikTok post and resolves it on retry", async () => {
    const seed = externalSeed()

    const first = await resolveOrCreateExternalPost(seed)
    const second = await resolveOrCreateExternalPost(seed)

    expect(second.id).toBe(first.id)
    expect(first).toMatchObject({
      origin: "tiktok_studio_import",
      integrationId: "integration-1",
      provider: "tiktok",
      externalPostId: "native-1",
      lifecycleStatus: "published",
      sourceType: "external",
      sourceId: "native-1",
    })
    expect(mocks.records).toHaveLength(1)
  })

  it("keeps the same TikTok external id distinct across integrations", async () => {
    const first = await resolveOrCreateExternalPost(externalSeed())
    const second = await resolveOrCreateExternalPost(
      externalSeed({ integrationId: "integration-2" })
    )

    expect(second.id).not.toBe(first.id)
    expect(mocks.records).toHaveLength(2)
  })

  it("enriches an existing generated post instead of duplicating it", async () => {
    mocks.records = [
      legacyRecord({
        id: "generated-post",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        status: "draft",
        linkState: "unlinked",
        externalPostId: undefined,
        releaseUrl: undefined,
      }),
    ]

    const post = await resolveOrCreateExternalPost(
      externalSeed({
        postId: "generated-post",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
      })
    )

    expect(post).toMatchObject({
      id: "generated-post",
      origin: "automation_generation",
      lifecycleStatus: "published",
      externalPostId: "native-1",
    })
    expect(mocks.records).toHaveLength(1)
  })

  it("rejects conflicting explicit and scoped external identities", async () => {
    mocks.records = [
      legacyRecord({
        id: "generated-post",
        externalPostId: "native-a",
      }),
      legacyRecord({
        id: "claimed-post",
        externalPostId: "native-b",
      }),
    ]

    await expect(
      resolveOrCreateExternalPost(
        externalSeed({
          postId: "generated-post",
          externalPostId: "native-b",
        })
      )
    ).rejects.toBeInstanceOf(PostIdentityConflictError)
    expect(mocks.putRecord).not.toHaveBeenCalled()
  })
})

function externalSeed(
  overrides: Partial<Parameters<typeof resolveOrCreateExternalPost>[0]> = {}
): Parameters<typeof resolveOrCreateExternalPost>[0] {
  return {
    ownerId: "owner-1",
    provider: "tiktok",
    integrationId: "integration-1",
    externalPostId: "native-1",
    origin: "tiktok_studio_import",
    linkMethod: "tiktok_studio",
    releaseUrl: "https://www.tiktok.com/@creator/video/native-1",
    ...overrides,
  }
}

function snapshotSeed(
  overrides: Partial<Parameters<typeof ensurePostForSnapshot>[0]> = {}
): Parameters<typeof ensurePostForSnapshot>[0] {
  return {
    postId: "snapshot-post-1",
    platformPostId: "native-1",
    integrationId: "integration-1",
    provider: "tiktok",
    capturedAt: "2026-07-30T00:00:00.000Z",
    publishedAt: "2026-07-29T00:00:00.000Z",
    content: "Remote post",
    releaseUrl: "https://www.tiktok.com/@creator/video/native-1",
    sourceType: "external",
    source: "postfast",
    ...overrides,
  }
}

function legacyRecord(
  overrides: Partial<PostFastPostRecord> = {}
): PostFastPostRecord {
  return {
    id: "canonical-post-1",
    sourceType: "external",
    sourceId: "native-1",
    integrationId: "integration-1",
    provider: "tiktok",
    status: "published",
    linkState: "manually_linked",
    statsSources: ["postfast"],
    content: "Existing post",
    media: [],
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  }
}
