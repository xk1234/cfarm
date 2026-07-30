import { describe, expect, it } from "vitest"

import {
  buildApplyResultManifest,
  planUnifiedPostApply,
  planUnifiedPostMigration,
  planUnifiedPostRollback,
  stableHash,
  stableStringify,
  verifyUnifiedPostMigration,
  type MigrationIdentity,
  type MigrationOutput,
  type MigrationSnapshot,
} from "@/lib/migrate-unified-posts-core"
import type { Post } from "@/lib/posts"

const ownerId = "confirmed-owner"
const plannedAt = "2026-07-30T12:00:00.000Z"

describe("unified-post migration planner", () => {
  it("plans the confirmed 32-output, zero-publication, one-orphan baseline", () => {
    const fixture = confirmedBaseline()
    const manifest = planUnifiedPostMigration(fixture)

    expect(manifest.expected.outputCount).toBe(fixture.outputs.length)
    expect(manifest.expected.validLegacyPublicationCount).toBe(0)
    expect(manifest.expected.orphanSnapshotCount).toBe(fixture.snapshots.length)
    expect(manifest.posts.length).toBeGreaterThanOrEqual(
      fixture.outputs.length + fixture.snapshots.length
    )
    expect(manifest.expected.mappedOutputCount).toBe(fixture.outputs.length)
    expect(
      manifest.posts.find(
        (proposal) => proposal.post.id === fixture.snapshots[0]?.postId
      )?.post
    ).toMatchObject({
      id: fixture.snapshots[0]?.postId,
      lifecycleStatus: "published",
      linkState: "externally_linked",
      provider: "tiktok",
      integrationId: "tiktok-account-1",
      externalPostId: "7460000000000000001",
      statsSources: ["tiktok_studio"],
    })
    expect(manifest.conflicts.filter((conflict) => conflict.material)).toEqual(
      []
    )
  })

  it("uses the exact deterministic migration intent seed per output destination", () => {
    const manifest = planUnifiedPostMigration(confirmedBaseline())
    const generated = manifest.posts.filter(
      (proposal) => proposal.post.id !== "known-tiktok-post"
    )

    for (const proposal of generated) {
      expect(proposal.outputRids).toHaveLength(1)
      const outputRid = proposal.outputRids[0]
      const destination = proposal.post.integrationId ?? "unassigned"
      expect(proposal.post.intentId).toBe(
        `migration:v1:${ownerId}:${outputRid}:${destination}`
      )
    }
    expect(
      generated.filter((proposal) => proposal.outputRids[0] === "output-01")
    ).toHaveLength(2)
  })

  it("is idempotent: an identical rerun is entirely no-op", () => {
    const manifest = planUnifiedPostMigration(confirmedBaseline())
    const first = planUnifiedPostApply({
      manifest,
      currentPosts: [],
      currentClaims: [],
    })
    expect(first.createPosts).toHaveLength(manifest.posts.length)
    expect(first.createClaims).toHaveLength(manifest.claims.length)

    const rerun = planUnifiedPostApply({
      manifest,
      currentPosts: manifest.posts.map((proposal) => proposal.post),
      currentClaims: manifest.claims,
    })
    expect(rerun.createPosts).toEqual([])
    expect(rerun.enrichPosts).toEqual([])
    expect(rerun.createClaims).toEqual([])
    expect(rerun.conflicts).toEqual([])
    expect(rerun.unchangedPostIds).toHaveLength(manifest.posts.length)
    expect(rerun.unchangedClaimIds).toHaveLength(manifest.claims.length)
  })

  it("verifies output, snapshot, claim, analytics-range, and surface totals", () => {
    const fixture = confirmedBaseline()
    const manifest = planUnifiedPostMigration(fixture)
    const report = verifyUnifiedPostMigration({
      manifest,
      outputs: fixture.outputs,
      snapshots: fixture.snapshots,
      posts: manifest.posts.map((proposal) => proposal.post),
      claims: manifest.claims,
      analyticsPostIds: fixture.snapshots.map((snapshot) => snapshot.postId),
      analyticsRange: {
        from: "2026-06-15T00:00:00.000Z",
        to: "2026-07-30T23:59:59.999Z",
      },
    })

    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.knownTikTokPostIds).toEqual(["known-tiktok-post"])
    expect(report.sourceCardinality.length).toBeGreaterThan(0)
  })

  it("reports a divergent existing target as a conflict and never an overwrite", () => {
    const manifest = planUnifiedPostMigration(confirmedBaseline())
    const proposed = manifest.posts[0]
    expect(proposed).toBeDefined()
    const divergent = {
      ...proposed!.post,
      content: "changed after the dry run",
    }

    const apply = planUnifiedPostApply({
      manifest,
      currentPosts: [divergent],
      currentClaims: [],
    })

    expect(apply.createPosts).not.toContainEqual(
      expect.objectContaining({ rowId: proposed!.rowId })
    )
    expect(apply.enrichPosts).toEqual([])
    expect(apply.conflicts).toContainEqual(
      expect.objectContaining({
        code: "divergent_existing_post",
        ids: [proposed!.post.id],
      })
    )
  })

  it("rolls back only created ids and restores exact enriched preimages", () => {
    const fixture = confirmedBaseline()
    const createdManifest = planUnifiedPostMigration(fixture)
    const createdActions = planUnifiedPostApply({
      manifest: createdManifest,
      currentPosts: [],
      currentClaims: [],
    })
    const createdResult = buildApplyResultManifest({
      manifest: createdManifest,
      appliedAt: "2026-07-30T12:05:00.000Z",
      actions: createdActions,
      finalPosts: createdManifest.posts.map((proposal) => proposal.post),
      finalClaims: createdManifest.claims,
    })
    const unrelatedPost = existingSnapshotPost("unrelated-post")
    const unrelatedClaim: MigrationIdentity = {
      rowId: "unrelated-claim-row",
      ownerId,
      postId: unrelatedPost.id,
      claim: {
        kind: "post_id",
        key: JSON.stringify(["post_id", ownerId, unrelatedPost.id]),
      },
    }
    const createdRollback = planUnifiedPostRollback({
      result: createdResult,
      currentPosts: [
        ...createdManifest.posts.map((proposal) => proposal.post),
        unrelatedPost,
      ],
      currentClaims: [...createdManifest.claims, unrelatedClaim],
    })
    expect(createdRollback.deletePostIds).toEqual(
      [...createdResult.created.postIds].sort()
    )
    expect(createdRollback.deleteClaimIds).toEqual(
      [...createdResult.created.claimIds].sort()
    )
    expect(createdRollback.deletePostIds).not.toContain(unrelatedPost.id)
    expect(createdRollback.deleteClaimIds).not.toContain(unrelatedClaim.rowId)

    const existing = existingSnapshotPost("known-tiktok-post")
    const enrichManifest = planUnifiedPostMigration({
      ...fixture,
      outputs: [],
      existingPosts: [existing],
    })
    const proposal = enrichManifest.posts.find(
      (item) => item.post.id === existing.id
    )
    expect(proposal?.preimage).toEqual(existing)
    const enrichActions = planUnifiedPostApply({
      manifest: enrichManifest,
      currentPosts: [existing],
      currentClaims: [],
    })
    expect(enrichActions.enrichPosts).toHaveLength(1)
    const enriched = enrichActions.enrichPosts[0]!.post
    const enrichResult = buildApplyResultManifest({
      manifest: enrichManifest,
      appliedAt: "2026-07-30T12:10:00.000Z",
      actions: enrichActions,
      finalPosts: [enriched],
      finalClaims: enrichManifest.claims,
    })
    const enrichRollback = planUnifiedPostRollback({
      result: enrichResult,
      currentPosts: [enriched],
      currentClaims: enrichManifest.claims,
    })
    expect(enrichRollback.restorePosts).toEqual([
      { postId: existing.id, post: existing },
    ])
  })

  it("produces stable hashes and checksums independent of object key order", () => {
    expect(stableStringify({ z: 1, a: { y: 2, b: 3 } })).toBe(
      stableStringify({ a: { b: 3, y: 2 }, z: 1 })
    )
    expect(stableHash({ z: 1, a: 2 })).toBe(stableHash({ a: 2, z: 1 }))

    const first = planUnifiedPostMigration(confirmedBaseline())
    const second = planUnifiedPostMigration(confirmedBaseline())
    expect(second.checksum).toBe(first.checksum)
    expect(stableHash(second)).toBe(stableHash(first))
  })
})

function confirmedBaseline() {
  const outputs: MigrationOutput[] = Array.from({ length: 32 }, (_, index) => {
    const ordinal = index + 1
    const suffix = String(ordinal).padStart(2, "0")
    const sourceKey =
      ordinal % 3 === 0
        ? "result"
        : ordinal % 3 === 1
          ? "generated_video"
          : "x_automation_run"
    const rid = `output-${suffix}`
    return {
      rowId: `output-row-${suffix}`,
      rid,
      sourceKey,
      sourceAutomationId: `automation-${suffix}`,
      sourceRunId: `run-${suffix}`,
      sourceEntityId: `entity-${suffix}`,
      status: "ready",
      title: `Output ${suffix}`,
      caption: `Authoritative caption ${suffix}`,
      hashtags: [`#fixture${suffix}`],
      createdAt: `2026-07-${String((ordinal % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
      updatedAt: `2026-07-${String((ordinal % 28) + 1).padStart(2, "0")}T10:05:00.000Z`,
      publications: [],
      data: {
        id: `entity-${suffix}`,
        title: `Output ${suffix}`,
        status: "ready",
        ...(ordinal === 1
          ? {
              destinations: [
                { provider: "tiktok", integrationId: "destination-a" },
                { provider: "instagram", integrationId: "destination-b" },
              ],
            }
          : {}),
      },
      raw: {
        $id: `output-row-${suffix}`,
        rid,
        source_key: sourceKey,
        publications: "[]",
      },
    } satisfies MigrationOutput
  })
  const snapshots: MigrationSnapshot[] = [
    {
      rowId: "snapshot-row-1",
      id: "snapshot-1",
      postId: "known-tiktok-post",
      platformPostId: "7460000000000000001",
      integrationId: "tiktok-account-1",
      provider: "tiktok",
      capturedAt: "2026-06-15T09:30:00.000Z",
      publishedAt: "2026-06-14T17:00:00.000Z",
      content: "Known TikTok caption",
      thumbnailUrl: "https://example.test/tiktok-thumbnail.jpg",
      releaseUrl: "https://www.tiktok.com/@fixture/video/7460000000000000001",
      sourceType: "external",
      sourceId: "remote-source-not-in-output-set",
      contentType: "slideshow",
      metrics: { views: 1200 },
      latestMetric: { views: 1200 },
      rawMetrics: { views: 1200 },
      observedKeys: ["views"],
      source: "tiktok_studio",
      raw: {
        $id: "snapshot-row-1",
        postId: "known-tiktok-post",
        capturedAt: "2026-06-15T09:30:00.000Z",
      },
    },
  ]
  return {
    ownerId,
    plannedAt,
    endpoint: "https://appwrite.example.test/v1",
    projectId: "cfarm-production",
    databaseId: "cfarm",
    outputs,
    snapshots,
    automationRuns: [],
    sources: [],
    existingPosts: [],
    existingClaims: [],
  }
}

function existingSnapshotPost(id: string): Post {
  return {
    schemaVersion: 1,
    id,
    intentId: `existing:${id}`,
    ownerId,
    origin: "migration",
    sourceType: "external",
    sourceId: "remote-source-not-in-output-set",
    sourceRefs: [{ kind: "external", id: "remote-source-not-in-output-set" }],
    lifecycleStatus: "generated",
    linkState: "unlinked",
    integrationId: "tiktok-account-1",
    provider: "tiktok",
    statsSources: [],
    content: "",
    hashtags: [],
    media: [],
    createdAt: "2026-06-14T17:00:00.000Z",
    updatedAt: "2026-06-14T17:00:00.000Z",
  }
}
