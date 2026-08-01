import crypto from "node:crypto"

import { clean, isRecord } from "@/lib/guards"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type {
  PostFastPostRecord,
  PostFastSourceType,
  PostFastStatsSource,
} from "@/lib/postfast-posts"
import {
  normalizePublicationRecord,
  validatePublicationRecord,
} from "@/lib/publication-record"
import {
  normalizeIdentityProvider,
  normalizePost,
  normalizePostProvider,
  postFromPostFastRecord,
  postIdentityClaims,
  type Post,
  type PostIdentityClaim,
  type PostMedia,
  type PostSourceRef,
} from "@/lib/posts"

export const UNIFIED_POST_MIGRATION_VERSION = 1 as const

export type MigrationOutput = {
  rowId: string
  rid: string
  sourceKey: string
  sourceAutomationId?: string
  sourceRunId?: string
  sourceEntityId?: string
  status?: string
  title?: string
  caption?: string
  text?: string
  hashtags?: unknown
  createdAt?: string
  updatedAt?: string
  publications?: unknown
  data?: unknown
  media?: Array<{
    kind?: string
    role?: string
    position?: number
    url?: string
  }>
  raw?: unknown
}

export type MigrationSnapshot = PostFastMetricSnapshot & {
  rowId: string
  raw?: unknown
}

export type MigrationSource = {
  table: string
  rowId: string
  rid: string
  sourceKey?: string
  data?: unknown
  raw?: unknown
}

export type MigrationIdentity = {
  rowId: string
  ownerId: string
  postId: string
  claim: PostIdentityClaim
  createdAt?: string
}

export type MigrationConflict = {
  code:
    | "duplicate_post_id"
    | "multi_post_claim"
    | "duplicate_provider_external"
    | "missing_remote_identity"
    | "invalid_worker_publication"
    | "unresolved_source_alias"
    | "ambiguous_source_alias"
    | "divergent_existing_post"
    | "divergent_existing_claim"
    | "input_drift"
    | "missing_expected_row"
    | "row_changed_after_apply"
  material: boolean
  message: string
  ids: string[]
}

export type MigrationInputHash = {
  table: "outputs" | "postfast_metric_snapshots" | string
  rowId: string
  hash: string
}

export type ProposedPost = {
  rowId: string
  post: Post
  outputRids: string[]
  preimage?: Post
  preimageHash?: string
}

export type ProposedClaim = MigrationIdentity & {
  identityHash: string
}

export type MigrationVerificationCounts = {
  outputCount: number
  validLegacyPublicationCount: number
  snapshotCount: number
  orphanSnapshotCount: number
  proposedPostCount: number
  proposedClaimCount: number
  mappedOutputCount: number
  lifecycle: Record<Post["lifecycleStatus"], number>
  withContent: number
  withPublishedAt: number
  legacyCalendar: { needsAction: number; failed: number }
  canonicalCalendar: { needsAction: number; failed: number }
  legacyDashboardPublished: number
  canonicalDashboardPublished: number
}

export type UnifiedPostsPlanManifest = {
  kind: "unified-posts-plan"
  version: typeof UNIFIED_POST_MIGRATION_VERSION
  plannedAt: string
  endpoint: string
  projectId: string
  databaseId: string
  ownerId: string
  inputHashes: MigrationInputHash[]
  posts: ProposedPost[]
  claims: ProposedClaim[]
  conflicts: MigrationConflict[]
  expected: MigrationVerificationCounts
  checksum: string
}

export type ApplyActionPlan = {
  createPosts: ProposedPost[]
  unchangedPostIds: string[]
  enrichPosts: ProposedPost[]
  createClaims: ProposedClaim[]
  unchangedClaimIds: string[]
  conflicts: MigrationConflict[]
}

export type ApplyResultManifest = {
  kind: "unified-posts-apply-result"
  version: typeof UNIFIED_POST_MIGRATION_VERSION
  appliedAt: string
  endpoint: string
  projectId: string
  databaseId: string
  ownerId: string
  planChecksum: string
  plan: UnifiedPostsPlanManifest
  created: { postIds: string[]; claimIds: string[] }
  unchanged: { postIds: string[]; claimIds: string[] }
  enriched: {
    postIds: string[]
    preimages: Array<{ postId: string; post: Post; hash: string }>
  }
  skipped: { postIds: string[]; claimIds: string[] }
  conflicted: { postIds: string[]; claimIds: string[] }
  appliedRowHashes: Array<{
    table: "posts" | "post_identities"
    rowId: string
    hash: string
  }>
  checksum: string
}

export type RollbackActionPlan = {
  deletePostIds: string[]
  deleteClaimIds: string[]
  restorePosts: Array<{ postId: string; post: Post }>
  conflicts: MigrationConflict[]
}

export type VerificationReport = {
  ok: boolean
  errors: string[]
  counts: MigrationVerificationCounts
  sourceCardinality: Array<{
    source: string
    outputCount: number
    postCount: number
  }>
  analyticsRange: { from: string; to: string } | null
  knownTikTokPostIds: string[]
}

export type PlanUnifiedPostsInput = {
  ownerId: string
  plannedAt: string
  endpoint: string
  projectId: string
  databaseId: string
  outputs: MigrationOutput[]
  snapshots: MigrationSnapshot[]
  automationRuns?: MigrationSource[]
  sources?: MigrationSource[]
  existingPosts?: Post[]
  existingClaims?: MigrationIdentity[]
}

type PostAccumulator = {
  post: Post
  outputRids: Set<string>
}

export function planUnifiedPostMigration(
  input: PlanUnifiedPostsInput
): UnifiedPostsPlanManifest {
  const ownerId = clean(input.ownerId)
  if (!ownerId) throw new Error("A migration owner is required.")
  const plannedAt = requiredDate(input.plannedAt, "plannedAt")
  const outputs = [...input.outputs].sort(compareRow)
  const snapshots = [...input.snapshots].sort(compareRow)
  const automationRuns = [...(input.automationRuns ?? [])].sort(compareRow)
  const sources = [...(input.sources ?? [])].sort(compareRow)
  const existingPosts = new Map(
    (input.existingPosts ?? []).map((post) => [post.id, post])
  )
  const existingClaims = new Map(
    (input.existingClaims ?? []).map((claim) => [claim.rowId, claim])
  )
  const conflicts: MigrationConflict[] = []
  const accumulated = new Map<string, PostAccumulator>()
  const validPublicationIds = new Set<string>()
  let validLegacyPublicationCount = 0

  for (const output of outputs) {
    const publications = legacyPublicationCandidates(output)
    const normalized = publications.flatMap((candidate, index) => {
      const validationErrors = validatePublicationRecord(candidate)
      const publication = normalizePublicationRecord(candidate)
      if (publication && validationErrors.length === 0) return [publication]
      conflicts.push({
        code: "invalid_worker_publication",
        material: true,
        message: `Output "${output.rid}" has an invalid embedded publication at index ${index}: ${validationErrors.join(", ") || "normalization failed"}.`,
        ids: [output.rid],
      })
      return []
    })

    if (normalized.length > 0) {
      for (const publication of normalized) {
        validLegacyPublicationCount += 1
        validPublicationIds.add(publication.id)
        const post = legacyPost(ownerId, output, publication)
        addPost(accumulated, post, [output.rid], conflicts)
      }
      continue
    }

    const destinations = recoverDestinations(
      output,
      automationRuns,
      sources,
      conflicts
    )
    const targets = destinations.length ? destinations : [null]
    for (const destination of targets) {
      const post = generatedPost(ownerId, output, destination)
      if (!post) {
        conflicts.push({
          code: "invalid_worker_publication",
          material: true,
          message: `Output "${output.rid}" has no authoritative persisted creation or update timestamp.`,
          ids: [output.rid],
        })
        continue
      }
      addPost(accumulated, post, [output.rid], conflicts)
    }
  }

  let orphanSnapshotCount = 0
  for (const snapshot of snapshots) {
    if (
      validPublicationIds.has(snapshot.postId) ||
      accumulated.has(snapshot.postId)
    ) {
      const current = accumulated.get(snapshot.postId)
      if (current) {
        const snapshotCandidate = snapshotPost(ownerId, snapshot, undefined)
        const enriched = snapshotCandidate
          ? enrichCompatiblePost(current.post, snapshotCandidate)
          : null
        if (enriched) {
          current.post = enriched
        } else {
          conflicts.push({
            code: "missing_remote_identity",
            material: true,
            message: `Snapshot "${snapshot.rowId}" cannot safely enrich its directly resolved post.`,
            ids: [snapshot.rowId, snapshot.postId],
          })
        }
      }
      continue
    }

    orphanSnapshotCount += 1
    const exactOutputs = outputs.filter((output) =>
      snapshotExactlyReferencesOutput(snapshot, output)
    )
    if (
      exactOutputs.length === 0 &&
      (snapshot.sourceId || snapshot.sourceType)
    ) {
      conflicts.push({
        code: "unresolved_source_alias",
        material: false,
        message: `Snapshot "${snapshot.rowId}" has no exact persisted output source match.`,
        ids: [snapshot.rowId, snapshot.postId],
      })
    }
    if (exactOutputs.length > 1) {
      conflicts.push({
        code: "ambiguous_source_alias",
        material: true,
        message: `Snapshot "${snapshot.rowId}" resolves to multiple outputs; no output was attached.`,
        ids: [snapshot.rowId, ...exactOutputs.map((output) => output.rid)],
      })
    }
    const attached = exactOutputs.length === 1 ? exactOutputs : []
    const post = snapshotPost(ownerId, snapshot, attached[0])
    if (!post) {
      conflicts.push({
        code: "missing_remote_identity",
        material: true,
        message: `Snapshot "${snapshot.rowId}" is missing a valid provider or integration.`,
        ids: [snapshot.rowId, snapshot.postId],
      })
      continue
    }
    addPost(
      accumulated,
      post,
      attached.map((output) => output.rid),
      conflicts
    )
  }

  const posts: ProposedPost[] = []
  for (const entry of [...accumulated.values()].sort((left, right) =>
    left.post.id.localeCompare(right.post.id)
  )) {
    const existing = existingPosts.get(entry.post.id)
    let target = entry.post
    let preimage: Post | undefined
    if (existing) {
      const enrichment = enrichCompatiblePost(existing, entry.post)
      if (!enrichment) {
        conflicts.push({
          code: "divergent_existing_post",
          material: true,
          message: `Canonical post "${entry.post.id}" differs from the deterministic migration proposal.`,
          ids: [entry.post.id],
        })
        continue
      }
      target = enrichment
      if (stableHash(existing) !== stableHash(target)) preimage = existing
    }
    posts.push({
      rowId: postRowId(ownerId, target.id),
      post: target,
      outputRids: [...entry.outputRids].sort(),
      ...(preimage ? { preimage, preimageHash: stableHash(preimage) } : {}),
    })
  }

  const claims = buildClaims(ownerId, posts, plannedAt, conflicts)
  for (const claim of claims) {
    const existing = existingClaims.get(claim.rowId)
    if (existing && !sameClaim(existing, claim)) {
      conflicts.push({
        code: "divergent_existing_claim",
        material: true,
        message: `Identity claim "${claim.rowId}" resolves to a different post.`,
        ids: [claim.rowId, existing.postId, claim.postId],
      })
    }
  }
  reportDuplicateRemoteIdentities(posts, conflicts)

  const expected = verificationCounts({
    outputs,
    snapshots,
    posts: posts.map((proposal) => proposal.post),
    legacyPublications: outputs.flatMap(validLegacyPublications),
    validLegacyPublicationCount,
    orphanSnapshotCount,
    proposedClaimCount: claims.length,
  })
  const manifestWithoutChecksum = {
    kind: "unified-posts-plan" as const,
    version: UNIFIED_POST_MIGRATION_VERSION,
    plannedAt,
    endpoint: clean(input.endpoint),
    projectId: clean(input.projectId),
    databaseId: clean(input.databaseId),
    ownerId,
    inputHashes: inputRowHashes({
      outputs,
      snapshots,
      automationRuns,
      sources,
    }),
    posts,
    claims,
    conflicts: sortConflicts(conflicts),
    expected,
  }
  return withChecksum(manifestWithoutChecksum)
}

export function compareMigrationInputHashes(
  manifest: UnifiedPostsPlanManifest,
  input: Pick<
    PlanUnifiedPostsInput,
    "outputs" | "snapshots" | "automationRuns" | "sources"
  >
): MigrationConflict[] {
  const current = inputRowHashes({
    outputs: input.outputs,
    snapshots: input.snapshots,
    automationRuns: input.automationRuns ?? [],
    sources: input.sources ?? [],
  })
  const expected = new Map(
    manifest.inputHashes.map((row) => [`${row.table}:${row.rowId}`, row.hash])
  )
  const actual = new Map(
    current.map((row) => [`${row.table}:${row.rowId}`, row.hash])
  )
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort()
  return keys.flatMap((key) => {
    if (expected.get(key) === actual.get(key)) return []
    return [
      {
        code: "input_drift" as const,
        material: true,
        message: `Migration input "${key}" changed after the dry-run manifest was created.`,
        ids: [key],
      },
    ]
  })
}

export function planUnifiedPostApply(input: {
  manifest: UnifiedPostsPlanManifest
  currentPosts: Post[]
  currentClaims: MigrationIdentity[]
}): ApplyActionPlan {
  assertValidChecksum(input.manifest)
  const posts = new Map(input.currentPosts.map((post) => [post.id, post]))
  const claims = new Map(
    input.currentClaims.map((claim) => [claim.rowId, claim])
  )
  const result: ApplyActionPlan = {
    createPosts: [],
    unchangedPostIds: [],
    enrichPosts: [],
    createClaims: [],
    unchangedClaimIds: [],
    conflicts: [],
  }

  for (const proposal of input.manifest.posts) {
    const current = posts.get(proposal.post.id)
    if (!current) {
      result.createPosts.push(proposal)
    } else if (stableHash(current) === stableHash(proposal.post)) {
      result.unchangedPostIds.push(proposal.post.id)
    } else if (
      proposal.preimageHash &&
      stableHash(current) === proposal.preimageHash
    ) {
      result.enrichPosts.push(proposal)
    } else {
      result.conflicts.push({
        code: "divergent_existing_post",
        material: true,
        message: `Canonical post "${proposal.post.id}" changed or diverges; it will not be overwritten.`,
        ids: [proposal.post.id],
      })
    }
  }

  for (const proposal of input.manifest.claims) {
    const current = claims.get(proposal.rowId)
    if (!current) {
      result.createClaims.push(proposal)
    } else if (sameClaim(current, proposal)) {
      result.unchangedClaimIds.push(proposal.rowId)
    } else {
      result.conflicts.push({
        code: "divergent_existing_claim",
        material: true,
        message: `Identity claim "${proposal.rowId}" changed or diverges; it will not be overwritten.`,
        ids: [proposal.rowId, current.postId, proposal.postId],
      })
    }
  }
  return result
}

export function buildApplyResultManifest(input: {
  manifest: UnifiedPostsPlanManifest
  appliedAt: string
  actions: ApplyActionPlan
  finalPosts: Post[]
  finalClaims: MigrationIdentity[]
}): ApplyResultManifest {
  assertValidChecksum(input.manifest)
  const posts = new Map(input.finalPosts.map((post) => [post.id, post]))
  const claims = new Map(input.finalClaims.map((claim) => [claim.rowId, claim]))
  const createdPostIds = input.actions.createPosts.map(
    (proposal) => proposal.post.id
  )
  const createdClaimIds = input.actions.createClaims.map(
    (proposal) => proposal.rowId
  )
  const enrichedPostIds = input.actions.enrichPosts.map(
    (proposal) => proposal.post.id
  )
  const conflictedPostIds = input.actions.conflicts
    .filter((conflict) => conflict.code === "divergent_existing_post")
    .flatMap((conflict) => conflict.ids.slice(0, 1))
  const conflictedClaimIds = input.actions.conflicts
    .filter((conflict) => conflict.code === "divergent_existing_claim")
    .flatMap((conflict) => conflict.ids.slice(0, 1))
  const appliedRowHashes = [
    ...[...new Set([...createdPostIds, ...enrichedPostIds])].flatMap(
      (postId) => {
        const post = posts.get(postId)
        return post
          ? [
              {
                table: "posts" as const,
                rowId: postRowId(input.manifest.ownerId, postId),
                hash: stableHash(post),
              },
            ]
          : []
      }
    ),
    ...createdClaimIds.flatMap((rowId) => {
      const claim = claims.get(rowId)
      return claim
        ? [
            {
              table: "post_identities" as const,
              rowId,
              hash: stableHash(claimRowComparable(claim)),
            },
          ]
        : []
    }),
  ].sort((left, right) =>
    `${left.table}:${left.rowId}`.localeCompare(`${right.table}:${right.rowId}`)
  )
  const withoutChecksum = {
    kind: "unified-posts-apply-result" as const,
    version: UNIFIED_POST_MIGRATION_VERSION,
    appliedAt: requiredDate(input.appliedAt, "appliedAt"),
    endpoint: input.manifest.endpoint,
    projectId: input.manifest.projectId,
    databaseId: input.manifest.databaseId,
    ownerId: input.manifest.ownerId,
    planChecksum: input.manifest.checksum,
    plan: input.manifest,
    created: {
      postIds: createdPostIds.sort(),
      claimIds: createdClaimIds.sort(),
    },
    unchanged: {
      postIds: [...input.actions.unchangedPostIds].sort(),
      claimIds: [...input.actions.unchangedClaimIds].sort(),
    },
    enriched: {
      postIds: enrichedPostIds.sort(),
      preimages: input.actions.enrichPosts
        .flatMap((proposal) =>
          proposal.preimage && proposal.preimageHash
            ? [
                {
                  postId: proposal.post.id,
                  post: proposal.preimage,
                  hash: proposal.preimageHash,
                },
              ]
            : []
        )
        .sort((left, right) => left.postId.localeCompare(right.postId)),
    },
    skipped: { postIds: [], claimIds: [] },
    conflicted: {
      postIds: [...new Set(conflictedPostIds)].sort(),
      claimIds: [...new Set(conflictedClaimIds)].sort(),
    },
    appliedRowHashes,
  }
  return withChecksum(withoutChecksum)
}

export function planUnifiedPostRollback(input: {
  result: ApplyResultManifest
  currentPosts: Post[]
  currentClaims: MigrationIdentity[]
}): RollbackActionPlan {
  assertValidChecksum(input.result)
  assertValidChecksum(input.result.plan)
  const posts = new Map(input.currentPosts.map((post) => [post.id, post]))
  const claims = new Map(
    input.currentClaims.map((claim) => [claim.rowId, claim])
  )
  const expectedHashes = new Map(
    input.result.appliedRowHashes.map((row) => [
      `${row.table}:${row.rowId}`,
      row.hash,
    ])
  )
  const plan: RollbackActionPlan = {
    deletePostIds: [],
    deleteClaimIds: [],
    restorePosts: [],
    conflicts: [],
  }
  for (const rowId of input.result.created.claimIds) {
    const current = claims.get(rowId)
    const expected = expectedHashes.get(`post_identities:${rowId}`)
    if (
      current &&
      expected &&
      stableHash(claimRowComparable(current)) === expected
    ) {
      plan.deleteClaimIds.push(rowId)
    } else {
      plan.conflicts.push(changedAfterApply("post identity", rowId))
    }
  }
  for (const postId of input.result.created.postIds) {
    const current = posts.get(postId)
    const rowId = postRowId(input.result.ownerId, postId)
    const expected = expectedHashes.get(`posts:${rowId}`)
    if (current && expected && stableHash(current) === expected) {
      plan.deletePostIds.push(postId)
    } else {
      plan.conflicts.push(changedAfterApply("post", postId))
    }
  }
  for (const preimage of input.result.enriched.preimages) {
    const current = posts.get(preimage.postId)
    const rowId = postRowId(input.result.ownerId, preimage.postId)
    const expected = expectedHashes.get(`posts:${rowId}`)
    if (current && expected && stableHash(current) === expected) {
      plan.restorePosts.push({
        postId: preimage.postId,
        post: preimage.post,
      })
    } else {
      plan.conflicts.push(changedAfterApply("post", preimage.postId))
    }
  }
  plan.deleteClaimIds.sort()
  plan.deletePostIds.sort()
  plan.restorePosts.sort((left, right) =>
    left.postId.localeCompare(right.postId)
  )
  plan.conflicts = sortConflicts(plan.conflicts)
  return plan
}

export function verifyUnifiedPostMigration(input: {
  manifest: UnifiedPostsPlanManifest
  outputs: MigrationOutput[]
  snapshots: MigrationSnapshot[]
  posts: Post[]
  claims: MigrationIdentity[]
  analyticsPostIds?: string[]
  analyticsRange?: { from: string; to: string }
}): VerificationReport {
  assertValidChecksum(input.manifest)
  const errors: string[] = []
  const ownerPosts = input.posts.filter(
    (post) => post.ownerId === input.manifest.ownerId && !post.mergedIntoId
  )
  const posts = new Map(ownerPosts.map((post) => [post.id, post]))
  const outputMappings = new Map(
    input.outputs.map((output) => [
      output.rid,
      ownerPosts.filter(
        (post) =>
          post.outputId === output.rid ||
          post.sourceRefs.some(
            (reference) =>
              reference.kind === "output" && reference.id === output.rid
          )
      ),
    ])
  )
  for (const [rid, mapped] of outputMappings) {
    if (mapped.length === 0) {
      errors.push(`Output "${rid}" does not map to a canonical post.`)
    }
  }

  const postIdAliases = new Map<string, Set<string>>()
  for (const identity of input.claims) {
    const parsed = parseClaim(identity.claim)
    if (parsed?.kind === "post_id") {
      const ids = postIdAliases.get(parsed.values[0]) ?? new Set<string>()
      ids.add(identity.postId)
      postIdAliases.set(parsed.values[0], ids)
    }
  }
  const currentClaims = new Map(
    input.claims.map((identity) => [identity.rowId, identity])
  )
  for (const expected of input.manifest.claims) {
    const current = currentClaims.get(expected.rowId)
    if (!current || !sameClaim(current, expected)) {
      errors.push(
        `Expected identity claim "${expected.rowId}" is missing or divergent.`
      )
    }
  }
  for (const snapshot of input.snapshots) {
    const resolved = new Set<string>()
    if (posts.has(snapshot.postId)) resolved.add(snapshot.postId)
    for (const postId of postIdAliases.get(snapshot.postId) ?? []) {
      if (posts.has(postId)) resolved.add(postId)
    }
    if (resolved.size !== 1) {
      errors.push(
        `Snapshot "${snapshot.rowId}" resolves to ${resolved.size} non-tombstoned posts.`
      )
    }
  }

  const claimTargets = new Map<string, Set<string>>()
  for (const identity of input.claims) {
    const key = identity.claim.key
    const targets = claimTargets.get(key) ?? new Set<string>()
    targets.add(identity.postId)
    claimTargets.set(key, targets)
    if (!posts.has(identity.postId)) {
      errors.push(
        `Identity claim "${identity.rowId}" points to a missing or tombstoned post.`
      )
    }
  }
  for (const [key, targets] of claimTargets) {
    if (targets.size !== 1) {
      errors.push(`Identity claim "${key}" resolves to ${targets.size} posts.`)
    }
  }

  const providerIdentities = new Map<string, string[]>()
  for (const post of ownerPosts) {
    if (!post.provider || !post.integrationId || !post.externalPostId) continue
    const key = JSON.stringify([
      normalizeIdentityProvider(post.provider),
      post.integrationId,
      post.externalPostId,
    ])
    providerIdentities.set(key, [
      ...(providerIdentities.get(key) ?? []),
      post.id,
    ])
  }
  for (const [identity, postIds] of providerIdentities) {
    if (new Set(postIds).size > 1) {
      errors.push(
        `Provider/integration/external identity ${identity} is duplicated.`
      )
    }
  }

  const actualMigratedPosts = input.manifest.posts.flatMap((proposal) => {
    const post = posts.get(proposal.post.id)
    return post ? [post] : []
  })
  const legacyPublications = input.outputs.flatMap(validLegacyPublications)
  const legacyPostIds = new Set(
    legacyPublications.map((publication) => publication.id)
  )
  const counts = verificationCounts({
    outputs: input.outputs,
    snapshots: input.snapshots,
    posts: actualMigratedPosts,
    legacyPublications,
    validLegacyPublicationCount: legacyPublications.length,
    orphanSnapshotCount: input.snapshots.filter(
      (snapshot) => !legacyPostIds.has(snapshot.postId)
    ).length,
    proposedClaimCount: input.manifest.claims.filter((expected) => {
      const current = currentClaims.get(expected.rowId)
      return Boolean(current && sameClaim(current, expected))
    }).length,
  })
  if (stableHash(counts) !== stableHash(input.manifest.expected)) {
    errors.push(
      "Content, status, date, or surface totals differ from the manifest."
    )
  }

  const knownTikTokSnapshots = input.snapshots.filter(
    (snapshot) => normalizeIdentityProvider(snapshot.provider) === "tiktok"
  )
  const analyticsIds = new Set(input.analyticsPostIds ?? [])
  const analyticsRange =
    input.analyticsRange ?? rangeForSnapshots(input.snapshots)
  for (const snapshot of knownTikTokSnapshots) {
    if (!analyticsIds.has(snapshot.postId)) {
      errors.push(
        `Known TikTok post "${snapshot.postId}" is absent from the analytics result.`
      )
    }
    if (
      !analyticsRange ||
      Date.parse(snapshot.capturedAt) < Date.parse(analyticsRange.from) ||
      Date.parse(snapshot.capturedAt) > Date.parse(analyticsRange.to)
    ) {
      errors.push(
        `Analytics range does not include snapshot "${snapshot.rowId}" capturedAt.`
      )
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    counts,
    sourceCardinality: sourceCardinality(input.outputs, ownerPosts),
    analyticsRange,
    knownTikTokPostIds: knownTikTokSnapshots
      .map((snapshot) => snapshot.postId)
      .sort(),
  }
}

export function stableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function withChecksum<T extends object>(
  value: T
): T & { checksum: string } {
  return { ...value, checksum: stableHash(value) }
}

export function assertValidChecksum(value: {
  checksum: string
  [key: string]: unknown
}): void {
  const { checksum, ...unsigned } = value
  if (!checksum || stableHash(unsigned) !== checksum) {
    throw new Error("The migration manifest checksum is invalid.")
  }
}

export function postRowId(ownerId: string, postId: string): string {
  return deterministicRowId("p", ["posts", ownerId, postId])
}

export function postIdentityRowId(claim: PostIdentityClaim): string {
  return deterministicRowId("i", ["post_identity", claim.key])
}

function generatedPost(
  ownerId: string,
  output: MigrationOutput,
  destination: { integrationId: string; provider: Post["provider"] } | null
): Post | null {
  const destinationKey = destination?.integrationId ?? "unassigned"
  const intentId = `migration:v1:${ownerId}:${output.rid}:${destinationKey}`
  const timestamp =
    firstDate(output.createdAt, record(output.data).createdAt) ??
    firstDate(output.updatedAt, record(output.data).updatedAt)
  if (!timestamp) return null
  const readyAt =
    firstDate(output.updatedAt, record(output.data).updatedAt) ?? timestamp
  const post: Post = {
    schemaVersion: 1,
    id: `migration-${stableHash(intentId).slice(0, 24)}`,
    intentId,
    ownerId,
    origin: "migration",
    sourceType: outputSourceType(output),
    sourceId: outputSourceId(output),
    sourceRefs: outputSourceRefs(output),
    outputId: output.rid,
    automationId: clean(output.sourceAutomationId) || undefined,
    runId: clean(output.sourceRunId) || undefined,
    sourceEntityId: clean(output.sourceEntityId) || undefined,
    lifecycleStatus:
      clean(output.status) === "ready" ||
      clean(record(output.data).status) === "ready"
        ? "ready"
        : "generated",
    linkState: "unlinked",
    integrationId: destination?.integrationId,
    provider: destination?.provider,
    statsSources: [],
    title:
      clean(output.title) ||
      clean(record(output.data).title) ||
      clean(record(output.data).name) ||
      undefined,
    content: authoritativeOutputContent(output),
    hashtags: outputHashtags(output),
    contentType: outputContentType(output),
    media: outputMedia(output),
    generatedAt: timestamp,
    ...(clean(output.status) === "ready" ||
    clean(record(output.data).status) === "ready"
      ? { readyAt }
      : {}),
    createdAt: timestamp,
    updatedAt: readyAt,
  }
  return normalizePost(post) ?? post
}

function legacyPost(
  ownerId: string,
  output: MigrationOutput,
  publication: PostFastPostRecord
): Post {
  const base = postFromPostFastRecord(publication, ownerId)
  return {
    ...base,
    sourceRefs: mergeSourceRefs(base.sourceRefs, outputSourceRefs(output)),
    outputId: output.rid,
    automationId: clean(output.sourceAutomationId) || undefined,
    runId: clean(output.sourceRunId) || undefined,
    sourceEntityId: clean(output.sourceEntityId) || undefined,
  }
}

function snapshotPost(
  ownerId: string,
  snapshot: MigrationSnapshot,
  output: MigrationOutput | undefined
): Post | null {
  const provider = normalizePostProvider(snapshot.provider)
  const integrationId = clean(snapshot.integrationId)
  if (!provider || !integrationId || !clean(snapshot.postId)) return null
  const publishedAt = firstDate(snapshot.publishedAt, snapshot.capturedAt)
  const updatedAt = firstDate(snapshot.capturedAt, snapshot.publishedAt)
  if (!publishedAt || !updatedAt) return null
  const sourceType = normalizedSourceType(snapshot.sourceType) ?? "external"
  const sourceId =
    clean(snapshot.sourceId) ||
    clean(snapshot.platformPostId) ||
    clean(snapshot.postId)
  const statsSource: PostFastStatsSource =
    snapshot.source === "tiktok_studio" ? "tiktok_studio" : "postfast"
  const refs = [
    ...(output ? outputSourceRefs(output) : []),
    { kind: "external" as const, id: sourceId },
  ]
  const post: Post = {
    schemaVersion: 1,
    id: clean(snapshot.postId),
    intentId: `migration:v1:${ownerId}:snapshot:${clean(snapshot.postId)}`,
    ownerId,
    origin: "migration",
    sourceType,
    sourceId,
    sourceRefs: mergeSourceRefs([], refs),
    outputId: output?.rid,
    automationId: clean(output?.sourceAutomationId) || undefined,
    runId: clean(output?.sourceRunId) || undefined,
    sourceEntityId: clean(output?.sourceEntityId) || undefined,
    lifecycleStatus: "published",
    linkState: "externally_linked",
    linkMethod:
      snapshot.source === "tiktok_studio" ? "tiktok_studio" : "analytics_sync",
    integrationId,
    provider,
    externalPostId: clean(snapshot.platformPostId) || clean(snapshot.postId),
    releaseUrl: clean(snapshot.releaseUrl) || undefined,
    statsSources: [statsSource],
    content: clean(snapshot.content),
    hashtags: [],
    contentType:
      snapshot.contentType === "slideshow" ||
      snapshot.contentType === "video" ||
      snapshot.contentType === "image" ||
      snapshot.contentType === "text"
        ? snapshot.contentType
        : undefined,
    media: clean(snapshot.thumbnailUrl)
      ? [
          {
            kind: "thumbnail",
            url: clean(snapshot.thumbnailUrl),
            order: 0,
          },
        ]
      : [],
    publishedAt,
    linkedAt: updatedAt,
    lastSyncedAt: updatedAt,
    createdAt: publishedAt,
    updatedAt,
  }
  return normalizePost(post) ?? post
}

function addPost(
  accumulated: Map<string, PostAccumulator>,
  incoming: Post,
  outputRids: string[],
  conflicts: MigrationConflict[]
) {
  const current = accumulated.get(incoming.id)
  if (!current) {
    accumulated.set(incoming.id, {
      post: incoming,
      outputRids: new Set(outputRids),
    })
    return
  }
  const merged = mergeProposedPost(current.post, incoming)
  if (!merged) {
    conflicts.push({
      code: "duplicate_post_id",
      material: true,
      message: `Post id "${incoming.id}" has divergent migration proposals.`,
      ids: [incoming.id],
    })
    return
  }
  current.post = merged
  outputRids.forEach((rid) => current.outputRids.add(rid))
  const allOutputRefs = [
    ...current.post.sourceRefs,
    ...[...current.outputRids].map((id) => ({
      kind: "output" as const,
      id,
    })),
  ]
  current.post = {
    ...current.post,
    outputId:
      current.outputRids.size === 1 ? [...current.outputRids][0] : undefined,
    sourceRefs: mergeSourceRefs([], allOutputRefs),
  }
}

function mergeProposedPost(left: Post, right: Post): Post | null {
  const incompatible = [
    "id",
    "ownerId",
    "integrationId",
    "provider",
    "postfastPostId",
    "externalPostId",
  ] satisfies Array<keyof Post>
  if (
    incompatible.some(
      (key) => left[key] && right[key] && left[key] !== right[key]
    )
  ) {
    return null
  }
  if (left.content && right.content && left.content !== right.content)
    return null
  return {
    ...left,
    sourceRefs: mergeSourceRefs(left.sourceRefs, right.sourceRefs),
    statsSources: unique([...left.statsSources, ...right.statsSources]),
    media: mergeMedia(left.media, right.media),
    outputId: left.outputId ?? right.outputId,
    automationId: left.automationId ?? right.automationId,
    runId: left.runId ?? right.runId,
    sourceEntityId: left.sourceEntityId ?? right.sourceEntityId,
    content: left.content || right.content,
    publishedAt: left.publishedAt ?? right.publishedAt,
    releaseUrl: left.releaseUrl ?? right.releaseUrl,
  }
}

function enrichCompatiblePost(existing: Post, incoming: Post): Post | null {
  const identityKeys = [
    "id",
    "ownerId",
    "integrationId",
    "provider",
    "postfastPostId",
    "externalPostId",
  ] satisfies Array<keyof Post>
  if (
    identityKeys.some(
      (key) => existing[key] && incoming[key] && existing[key] !== incoming[key]
    )
  ) {
    return null
  }
  if (
    existing.content &&
    incoming.content &&
    existing.content !== incoming.content
  ) {
    return null
  }
  if (
    existing.publishedAt &&
    incoming.publishedAt &&
    existing.publishedAt !== incoming.publishedAt
  ) {
    return null
  }
  const mayAdvanceToPublished =
    incoming.lifecycleStatus === "published" &&
    existing.lifecycleStatus !== "failed"
  if (
    existing.lifecycleStatus !== incoming.lifecycleStatus &&
    !mayAdvanceToPublished
  ) {
    return null
  }
  return {
    ...incoming,
    ...existing,
    sourceType: existing.sourceType ?? incoming.sourceType,
    sourceId: existing.sourceId ?? incoming.sourceId,
    sourceRefs: mergeSourceRefs(existing.sourceRefs, incoming.sourceRefs),
    outputId: existing.outputId ?? incoming.outputId,
    automationId: existing.automationId ?? incoming.automationId,
    runId: existing.runId ?? incoming.runId,
    sourceEntityId: existing.sourceEntityId ?? incoming.sourceEntityId,
    lifecycleStatus: mayAdvanceToPublished
      ? "published"
      : existing.lifecycleStatus,
    linkState:
      existing.linkState === "postfast_managed"
        ? "postfast_managed"
        : incoming.linkState === "externally_linked"
          ? "externally_linked"
          : existing.linkState,
    linkMethod: existing.linkMethod ?? incoming.linkMethod,
    integrationId: existing.integrationId ?? incoming.integrationId,
    provider: existing.provider ?? incoming.provider,
    postfastPostId: existing.postfastPostId ?? incoming.postfastPostId,
    externalPostId: existing.externalPostId ?? incoming.externalPostId,
    releaseUrl: existing.releaseUrl ?? incoming.releaseUrl,
    statsSources: unique([...existing.statsSources, ...incoming.statsSources]),
    content: existing.content || incoming.content,
    hashtags: existing.hashtags.length ? existing.hashtags : incoming.hashtags,
    contentType: existing.contentType ?? incoming.contentType,
    media: mergeMedia(existing.media, incoming.media),
    generatedAt: existing.generatedAt ?? incoming.generatedAt,
    readyAt: existing.readyAt ?? incoming.readyAt,
    scheduledAt: existing.scheduledAt ?? incoming.scheduledAt,
    publishedAt: existing.publishedAt ?? incoming.publishedAt,
    linkedAt: existing.linkedAt ?? incoming.linkedAt,
    failedAt: existing.failedAt ?? incoming.failedAt,
    lastSyncedAt: laterDate(existing.lastSyncedAt, incoming.lastSyncedAt),
    createdAt: existing.createdAt,
    updatedAt:
      laterDate(existing.updatedAt, incoming.updatedAt) ?? existing.updatedAt,
  }
}

function buildClaims(
  ownerId: string,
  posts: ProposedPost[],
  createdAt: string,
  conflicts: MigrationConflict[]
): ProposedClaim[] {
  const byRowId = new Map<string, ProposedClaim>()
  for (const proposal of posts) {
    const destinations = proposal.outputRids.length
      ? proposal.outputRids.map((outputRid) => ({
          outputRid,
          destinationKey: proposal.post.integrationId ?? "unassigned",
        }))
      : [{ outputRid: "", destinationKey: "" }]
    const claims = [
      ...postIdentityClaims(proposal.post),
      ...destinations.flatMap(({ outputRid, destinationKey }) =>
        postIdentityClaims({
          ownerId,
          outputId: outputRid,
          destinationKey,
        })
      ),
    ]
    for (const claim of dedupeClaims(claims)) {
      const rowId = postIdentityRowId(claim)
      const candidate: ProposedClaim = {
        rowId,
        ownerId,
        postId: proposal.post.id,
        claim,
        identityHash: crypto
          .createHash("sha256")
          .update(claim.key)
          .digest("hex"),
        createdAt,
      }
      const current = byRowId.get(rowId)
      if (!current) {
        byRowId.set(rowId, candidate)
      } else if (current.postId !== candidate.postId) {
        conflicts.push({
          code: "multi_post_claim",
          material: true,
          message: `Identity claim "${rowId}" resolves to multiple proposed posts.`,
          ids: [rowId, current.postId, candidate.postId],
        })
      }
    }
  }
  return [...byRowId.values()].sort((left, right) =>
    left.rowId.localeCompare(right.rowId)
  )
}

function reportDuplicateRemoteIdentities(
  posts: ProposedPost[],
  conflicts: MigrationConflict[]
) {
  const groups = new Map<string, string[]>()
  for (const { post } of posts) {
    if (!post.provider || !post.integrationId || !post.externalPostId) continue
    const key = JSON.stringify([
      normalizeIdentityProvider(post.provider),
      post.integrationId,
      post.externalPostId,
    ])
    groups.set(key, [...(groups.get(key) ?? []), post.id])
  }
  for (const [key, ids] of groups) {
    if (new Set(ids).size < 2) continue
    conflicts.push({
      code: "duplicate_provider_external",
      material: true,
      message: `Provider/integration/external identity ${key} is duplicated.`,
      ids: [...new Set(ids)].sort(),
    })
  }
}

function recoverDestinations(
  output: MigrationOutput,
  automationRuns: MigrationSource[],
  sources: MigrationSource[],
  conflicts: MigrationConflict[]
): Array<{ integrationId: string; provider: Post["provider"] }> {
  const related = [
    record(output.data),
    ...automationRuns
      .filter((source) => sourceMatchesOutput(source, output))
      .map((source) => record(source.data)),
    ...sources
      .filter((source) => sourceMatchesOutput(source, output))
      .map((source) => record(source.data)),
  ]
  const candidates = related.flatMap(destinationCandidates)
  const valid = new Map<
    string,
    { integrationId: string; provider: Post["provider"] }
  >()
  for (const candidate of candidates) {
    const integrationId = clean(candidate.integrationId)
    const provider = normalizePostProvider(candidate.provider)
    if (!integrationId || !provider) {
      if (integrationId || clean(candidate.provider)) {
        conflicts.push({
          code: "missing_remote_identity",
          material: false,
          message: `Output "${output.rid}" has a partial destination identity that was not recovered.`,
          ids: [output.rid],
        })
      }
      continue
    }
    valid.set(`${normalizeIdentityProvider(provider)}:${integrationId}`, {
      integrationId,
      provider,
    })
  }
  return [...valid.values()].sort((left, right) =>
    `${normalizeIdentityProvider(left.provider)}:${left.integrationId}`.localeCompare(
      `${normalizeIdentityProvider(right.provider)}:${right.integrationId}`
    )
  )
}

function destinationCandidates(
  value: Record<string, unknown>
): Array<{ integrationId?: unknown; provider?: unknown }> {
  const schema = record(value.schema)
  const publishing = record(value.publishing)
  const sourceConfig = record(value.sourceConfig)
  const nested = [
    value.destinations,
    value.postIntentDestinations,
    value.socialStatuses,
    value.social_integrations,
    schema.social_integrations,
    publishing.integrations,
    sourceConfig.destinations,
  ]
  return nested.flatMap((items) =>
    Array.isArray(items)
      ? items.map((item) => {
          const destination = record(item)
          return {
            integrationId:
              destination.integrationId ?? destination.integration_id,
            provider: destination.provider ?? destination.platform,
          }
        })
      : []
  )
}

function sourceMatchesOutput(
  source: MigrationSource,
  output: MigrationOutput
): boolean {
  const data = record(source.data)
  const values = new Set(
    [
      source.rid,
      clean(data.id),
      clean(data.runId),
      clean(data.automationId),
    ].filter(Boolean)
  )
  return [
    output.rid,
    clean(output.sourceRunId),
    clean(output.sourceAutomationId),
    clean(output.sourceEntityId),
  ].some((value) => value && values.has(value))
}

function snapshotExactlyReferencesOutput(
  snapshot: MigrationSnapshot,
  output: MigrationOutput
): boolean {
  const sourceId = clean(snapshot.sourceId)
  if (!sourceId) return false
  const sourceType = clean(snapshot.sourceType)
  const outputType = outputSourceType(output)
  if (sourceType && outputType && sourceType !== outputType) return false
  if (sourceId === output.rid || sourceId === clean(output.sourceEntityId)) {
    return true
  }
  if (
    (sourceType === "automation" || sourceType === "x_automation") &&
    sourceId === clean(output.sourceRunId)
  ) {
    return true
  }
  return false
}

function legacyPublicationCandidates(output: MigrationOutput): unknown[] {
  const values: unknown[] = []
  const add = (value: unknown) => {
    if (value === undefined || value === null || value === "") return
    const parsed = parseJson(value)
    if (Array.isArray(parsed)) values.push(...parsed)
    else values.push(parsed)
  }
  add(output.publications)
  const data = record(output.data)
  add(data.publications)
  add(data.publication)
  const uniqueValues = new Map(
    values.map((value) => [stableStringify(value), value])
  )
  return [...uniqueValues.values()]
}

function outputSourceType(output: MigrationOutput): PostFastSourceType {
  const explicit = normalizedSourceType(record(output.data).sourceType)
  if (explicit) return explicit
  if (output.sourceKey === "result") return "slideshow"
  if (output.sourceKey === "x_automation_run") return "x_automation"
  if (output.sourceKey === "generated_video") {
    return normalizedSourceType(record(output.data).type) ?? "generated_video"
  }
  return normalizedSourceType(output.sourceKey) ?? "manual"
}

function outputSourceId(output: MigrationOutput): string {
  if (output.sourceKey === "result") {
    const artifacts = record(record(output.data).artifacts)
    return (
      clean(artifacts.slideshowId) ||
      clean(output.sourceEntityId) ||
      clean(record(output.data).id) ||
      output.rid
    )
  }
  return (
    clean(output.sourceEntityId) || clean(record(output.data).id) || output.rid
  )
}

function outputSourceRefs(output: MigrationOutput): PostSourceRef[] {
  const refs: PostSourceRef[] = [{ kind: "output", id: output.rid }]
  const add = (kind: PostSourceRef["kind"], value: unknown) => {
    const id = clean(value)
    if (id) refs.push({ kind, id })
  }
  add("automation", output.sourceAutomationId)
  add("run", output.sourceRunId)
  if (output.sourceKey === "result") add("slideshow", outputSourceId(output))
  if (output.sourceKey === "generated_video") {
    add("generated_video", outputSourceId(output))
  }
  if (output.sourceKey === "x_automation_run") {
    add("x_automation", outputSourceId(output))
  }
  return mergeSourceRefs([], refs)
}

function authoritativeOutputContent(output: MigrationOutput): string {
  const data = record(output.data)
  const payload = record(data.payload)
  const pieces = [
    clean(output.caption),
    clean(data.caption),
    clean(data.description),
    clean(payload.caption),
    clean(output.text),
    clean(data.text),
  ].filter(Boolean)
  return pieces[0] ?? ""
}

function outputHashtags(output: MigrationOutput): string[] {
  const data = record(output.data)
  const payload = record(data.payload)
  for (const value of [output.hashtags, data.hashtags, payload.hashtags]) {
    const parsed = parseJson(value)
    if (Array.isArray(parsed)) {
      const hashtags = parsed.map(clean).filter(Boolean)
      if (hashtags.length) return unique(hashtags)
    }
    const text = clean(parsed)
    if (text) return unique(text.split(/\s+/).filter(Boolean))
  }
  return []
}

function outputMedia(output: MigrationOutput): PostMedia[] {
  const data = record(output.data)
  const artifacts = record(data.artifacts)
  const values: Array<{
    kind: PostMedia["kind"]
    url: unknown
    order: number
  }> = []
  const add = (kind: PostMedia["kind"], url: unknown, order = values.length) =>
    values.push({ kind, url, order })
  ;(output.media ?? []).forEach((media, index) => {
    const kind =
      media.kind === "video"
        ? "video"
        : media.role === "thumbnail"
          ? "thumbnail"
          : "image"
    add(kind, media.url, media.position ?? index)
  })
  if (Array.isArray(artifacts.outputImages)) {
    artifacts.outputImages.forEach((url, index) => add("image", url, index))
  }
  add("video", artifacts.videoUrl)
  add("thumbnail", artifacts.thumbnailUrl)
  add("video", data.videoUrl)
  add("thumbnail", data.previewUrl)
  if (Array.isArray(data.imageUrls)) {
    data.imageUrls.forEach((url, index) => add("image", url, index))
  }
  const seen = new Set<string>()
  return values.flatMap((media) => {
    const url = clean(media.url)
    const key = `${media.kind}:${media.order}:${url}`
    if (!url || seen.has(key)) return []
    seen.add(key)
    return [{ kind: media.kind, url, order: media.order }]
  })
}

function outputContentType(output: MigrationOutput): Post["contentType"] {
  if (output.sourceKey === "result") return "slideshow"
  if (output.sourceKey === "generated_video") return "video"
  if (output.sourceKey === "x_automation_run") {
    return outputMedia(output).length ? "image" : "text"
  }
  return outputMedia(output).some((media) => media.kind === "video")
    ? "video"
    : outputMedia(output).length
      ? "image"
      : "text"
}

function verificationCounts(input: {
  outputs: MigrationOutput[]
  snapshots: MigrationSnapshot[]
  posts: Post[]
  legacyPublications: PostFastPostRecord[]
  validLegacyPublicationCount: number
  orphanSnapshotCount: number
  proposedClaimCount: number
}): MigrationVerificationCounts {
  const lifecycle: MigrationVerificationCounts["lifecycle"] = {
    generated: 0,
    ready: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  }
  input.posts.forEach((post) => {
    lifecycle[post.lifecycleStatus] += 1
  })
  return {
    outputCount: input.outputs.length,
    validLegacyPublicationCount: input.validLegacyPublicationCount,
    snapshotCount: input.snapshots.length,
    orphanSnapshotCount: input.orphanSnapshotCount,
    proposedPostCount: input.posts.length,
    proposedClaimCount: input.proposedClaimCount,
    mappedOutputCount: input.outputs.filter((output) =>
      input.posts.some(
        (post) =>
          post.outputId === output.rid ||
          post.sourceRefs.some(
            (reference) =>
              reference.kind === "output" && reference.id === output.rid
          )
      )
    ).length,
    lifecycle,
    withContent: input.posts.filter((post) => clean(post.content)).length,
    withPublishedAt: input.posts.filter((post) => post.publishedAt).length,
    legacyCalendar: calendarCountsFromLegacy(input.legacyPublications),
    canonicalCalendar: calendarCountsFromPosts(input.posts),
    legacyDashboardPublished: input.legacyPublications.filter(
      (publication) => publication.status === "published"
    ).length,
    canonicalDashboardPublished: input.posts.filter(
      (post) => post.lifecycleStatus === "published"
    ).length,
  }
}

function validLegacyPublications(
  output: MigrationOutput
): PostFastPostRecord[] {
  return legacyPublicationCandidates(output).flatMap((candidate) => {
    const publication = normalizePublicationRecord(candidate)
    return publication && validatePublicationRecord(candidate).length === 0
      ? [publication]
      : []
  })
}

function calendarCountsFromLegacy(publications: PostFastPostRecord[]) {
  return {
    needsAction: publications.filter(
      (publication) =>
        publication.status === "awaiting_manual_post" ||
        publication.status === "ready_for_review"
    ).length,
    failed: publications.filter(
      (publication) => publication.status === "failed"
    ).length,
  }
}

function calendarCountsFromPosts(posts: Post[]) {
  return {
    needsAction: posts.filter(
      (post) =>
        post.lifecycleStatus === "ready" &&
        (post.publishMode === "manual" || post.publishMode === "review")
    ).length,
    failed: posts.filter((post) => post.lifecycleStatus === "failed").length,
  }
}

function sourceCardinality(outputs: MigrationOutput[], posts: Post[]) {
  const sources = new Set<string>()
  const outputSources = new Map<string, Set<string>>()
  const postSources = new Map<string, Set<string>>()
  for (const output of outputs) {
    const key = `${outputSourceType(output)}:${outputSourceId(output)}`
    sources.add(key)
    const ids = outputSources.get(key) ?? new Set<string>()
    ids.add(output.rid)
    outputSources.set(key, ids)
  }
  for (const post of posts) {
    if (!post.sourceType || !post.sourceId) continue
    const key = `${post.sourceType}:${post.sourceId}`
    sources.add(key)
    const ids = postSources.get(key) ?? new Set<string>()
    ids.add(post.id)
    postSources.set(key, ids)
  }
  return [...sources].sort().map((source) => ({
    source,
    outputCount: outputSources.get(source)?.size ?? 0,
    postCount: postSources.get(source)?.size ?? 0,
  }))
}

function inputRowHashes(input: {
  outputs: MigrationOutput[]
  snapshots: MigrationSnapshot[]
  automationRuns: MigrationSource[]
  sources: MigrationSource[]
}): MigrationInputHash[] {
  const hashes = [
    ...input.outputs.map((row) => ({
      table: "outputs",
      rowId: row.rowId,
      hash: stableHash(row.raw ?? row),
    })),
    ...input.snapshots.map((row) => ({
      table: "postfast_metric_snapshots",
      rowId: row.rowId,
      hash: stableHash(row.raw ?? row),
    })),
    ...input.automationRuns.map((row) => ({
      table: row.table,
      rowId: row.rowId,
      hash: stableHash(row.raw ?? row),
    })),
    ...input.sources.map((row) => ({
      table: row.table,
      rowId: row.rowId,
      hash: stableHash(row.raw ?? row),
    })),
  ]
  return [
    ...new Map(
      hashes.map((row) => [`${row.table}:${row.rowId}`, row])
    ).values(),
  ].sort((left, right) =>
    `${left.table}:${left.rowId}`.localeCompare(`${right.table}:${right.rowId}`)
  )
}

function rangeForSnapshots(
  snapshots: MigrationSnapshot[]
): { from: string; to: string } | null {
  const dates = snapshots
    .map((snapshot) => Date.parse(snapshot.capturedAt))
    .filter(Number.isFinite)
  if (!dates.length) return null
  return {
    from: new Date(Math.min(...dates)).toISOString(),
    to: new Date(Math.max(...dates)).toISOString(),
  }
}

function changedAfterApply(kind: string, id: string): MigrationConflict {
  return {
    code: "row_changed_after_apply",
    material: true,
    message: `The ${kind} "${id}" is missing or changed since apply; rollback refused it.`,
    ids: [id],
  }
}

function sameClaim(left: MigrationIdentity, right: MigrationIdentity): boolean {
  return (
    stableHash(claimComparable(left)) === stableHash(claimComparable(right))
  )
}

function claimComparable(identity: MigrationIdentity) {
  return {
    rowId: identity.rowId,
    ownerId: identity.ownerId,
    postId: identity.postId,
    claim: identity.claim,
  }
}

function claimRowComparable(identity: MigrationIdentity) {
  return {
    ...claimComparable(identity),
    createdAt: identity.createdAt,
  }
}

function parseClaim(claim: PostIdentityClaim): {
  kind: PostIdentityClaim["kind"]
  values: string[]
} | null {
  try {
    const parsed = JSON.parse(claim.key)
    if (
      !Array.isArray(parsed) ||
      parsed[0] !== claim.kind ||
      typeof parsed[1] !== "string"
    ) {
      return null
    }
    return {
      kind: claim.kind,
      values: parsed.slice(2).map(clean),
    }
  } catch {
    return null
  }
}

function dedupeClaims(claims: PostIdentityClaim[]) {
  return [
    ...new Map(
      claims.map((claim) => [`${claim.kind}:${claim.key}`, claim])
    ).values(),
  ]
}

function mergeSourceRefs(left: PostSourceRef[], right: PostSourceRef[]) {
  return [
    ...new Map(
      [...left, ...right]
        .filter((reference) => reference.id)
        .map((reference) => [`${reference.kind}:${reference.id}`, reference])
    ).values(),
  ].sort((first, second) =>
    `${first.kind}:${first.id}`.localeCompare(`${second.kind}:${second.id}`)
  )
}

function mergeMedia(left: PostMedia[], right: PostMedia[]) {
  return [
    ...new Map(
      [...left, ...right].map((media) => [
        `${media.kind}:${media.order}:${media.url ?? ""}:${media.postfastKey ?? ""}`,
        media,
      ])
    ).values(),
  ].sort((first, second) => first.order - second.order)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  )
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizedSourceType(value: unknown): PostFastSourceType | undefined {
  const sourceType = clean(value) as PostFastSourceType
  return [
    "automation",
    "x_automation",
    "generated_video",
    "asset",
    "greenscreen",
    "ugc_ad",
    "image",
    "slideshow",
    "manual",
    "external",
  ].includes(sourceType)
    ? sourceType
    : undefined
}

function deterministicRowId(prefix: string, values: string[]) {
  return `${prefix}${stableHash(values).slice(0, 35)}`
}

function firstDate(...values: unknown[]): string | undefined {
  return values.map(clean).find((value) => Number.isFinite(Date.parse(value)))
}

function laterDate(
  left: string | undefined,
  right: string | undefined
): string | undefined {
  const values = [left, right].filter((value): value is string =>
    Boolean(value && Number.isFinite(Date.parse(value)))
  )
  return values.sort(
    (first, second) => Date.parse(second) - Date.parse(first)
  )[0]
}

function requiredDate(value: unknown, label: string) {
  const date = clean(value)
  if (!date || !Number.isFinite(Date.parse(date))) {
    throw new Error(`A valid ${label} timestamp is required.`)
  }
  return date
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function compareRow(left: { rowId: string }, right: { rowId: string }): number {
  return left.rowId.localeCompare(right.rowId)
}

function sortConflicts(conflicts: MigrationConflict[]) {
  return [...conflicts].sort((left, right) =>
    `${left.code}:${left.ids.join(":")}:${left.message}`.localeCompare(
      `${right.code}:${right.ids.join(":")}:${right.message}`
    )
  )
}
