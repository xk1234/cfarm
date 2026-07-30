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
})

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
