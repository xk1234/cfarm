import crypto from "node:crypto"

import { clean } from "@/lib/guards"
import { outputPublicationsOwnerId } from "@/lib/output-publications"
import {
  appwritePostRepository,
  type PostPatch,
  type PostIdentityRecord,
} from "@/lib/post-repository-appwrite"
import {
  postRepositoryReadMode,
  postRepositoryWriteMode,
} from "@/lib/post-repository-config"
import { PostIdentityConflictError } from "@/lib/post-repository-errors"
import type { PostContentType } from "@/lib/post-content-type"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import {
  addPostFastPostStatsSources,
  listPostFastPostRecords,
  putPostFastPostRecord,
  type PostFastSourceType,
  type PostFastStatsSource,
} from "@/lib/postfast-posts"
import {
  normalizeIdentityProvider,
  normalizePost,
  normalizePostProvider,
  postFromPostFastRecord,
  postIdentityClaims,
  postIdentityClaimsForPost,
  postToPostFastRecord,
  type Post,
  type PostIdentityClaim,
} from "@/lib/posts"

export type SnapshotPostSeed = Pick<
  PostFastMetricSnapshot,
  | "postId"
  | "platformPostId"
  | "integrationId"
  | "provider"
  | "capturedAt"
  | "publishedAt"
  | "content"
  | "thumbnailUrl"
  | "releaseUrl"
  | "sourceType"
  | "sourceId"
  | "contentType"
  | "source"
> & {
  postfastPostId?: string
}

export type ExternalPostSeed = {
  ownerId: string
  provider: string
  integrationId: string
  externalPostId: string
  postId?: string
  postfastPostId?: string
  origin: Extract<
    Post["origin"],
    "postfast_sync" | "tiktok_publication_import" | "tiktok_studio_import"
  >
  linkMethod: Extract<
    NonNullable<Post["linkMethod"]>,
    "analytics_sync" | "tiktok_publication_import" | "tiktok_studio"
  >
  sourceType?: PostFastSourceType
  sourceId?: string
  publishedAt?: string
  releaseUrl?: string
  content?: string
  contentType?: Post["contentType"]
  thumbnailUrl?: string
  statsSources?: readonly PostFastStatsSource[]
}

export interface PostRepository {
  listPosts(): Promise<Post[]>
  getPost(id: string): Promise<Post | null>
  upsertPost(post: Post): Promise<Post>
  claimPostIdentity(
    postId: string,
    claim: PostIdentityClaim
  ): Promise<PostIdentityRecord>
  patchPost(id: string, patch: PostPatch): Promise<Post | null>
  resolveOrCreateExternalPost(seed: ExternalPostSeed): Promise<Post>
  ensurePostForSnapshot(snapshot: SnapshotPostSeed): Promise<Post>
  addStatsSources(
    sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
  ): Promise<number>
}

export { PostIdentityConflictError } from "@/lib/post-repository-errors"

export class ConfiguredPostRepository implements PostRepository {
  async listPosts(): Promise<Post[]> {
    const mode = postRepositoryReadMode()
    const ownerId = await outputPublicationsOwnerId()
    if (mode === "canonical") {
      return appwritePostRepository.listPosts(ownerId)
    }
    const legacy = (await listPostFastPostRecords()).map((record) =>
      postFromPostFastRecord(record, ownerId)
    )
    if (mode === "legacy") return legacy

    try {
      const canonical = await appwritePostRepository.listPosts(ownerId)
      logPostRepositoryShadowDiff(ownerId, legacy, canonical)
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "post_repository_shadow_error",
          ownerId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
    return legacy
  }

  async getPost(id: string): Promise<Post | null> {
    const normalizedId = clean(id)
    if (!normalizedId) return null
    if (postRepositoryReadMode() === "canonical") {
      return appwritePostRepository.getPost(
        await outputPublicationsOwnerId(),
        normalizedId
      )
    }
    return (
      (await this.listPosts()).find((post) => post.id === normalizedId) ?? null
    )
  }

  async upsertPost(post: Post): Promise<Post> {
    const normalized = normalizeRepositoryPost(post)
    const ownerId = await outputPublicationsOwnerId()
    if (normalized.ownerId !== ownerId) {
      throw new PostIdentityConflictError(
        "The supplied post owner does not match the active owner."
      )
    }
    if (postRepositoryWriteMode() === "canonical") {
      return appwritePostRepository.upsertPost(normalized, {
        writeState: "reconciled",
      })
    }
    await putPostFastPostRecord(postToPostFastRecord(normalized))
    return normalized
  }

  async claimPostIdentity(
    postId: string,
    claim: PostIdentityClaim
  ): Promise<PostIdentityRecord> {
    return appwritePostRepository.claimPostIdentity(
      await outputPublicationsOwnerId(),
      postId,
      claim
    )
  }

  async patchPost(id: string, patch: PostPatch): Promise<Post | null> {
    const current = await this.getPost(id)
    if (!current) return null
    return this.upsertPost({
      ...current,
      ...patch,
      schemaVersion: 1,
      id: current.id,
      ownerId: current.ownerId,
      createdAt: current.createdAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    })
  }

  async resolveOrCreateExternalPost(input: ExternalPostSeed): Promise<Post> {
    const repositoryOwnerId = await outputPublicationsOwnerId()
    const seed = normalizeExternalPostSeed(input)
    if (repositoryOwnerId !== seed.ownerId) {
      throw new PostIdentityConflictError(
        "The supplied post owner does not match the active owner."
      )
    }
    const posts = await this.listPosts()
    const suppliedClaims = postIdentityClaims({
      ownerId: seed.ownerId,
      id: seed.postId,
      integrationId: seed.integrationId,
      provider: seed.provider,
      postfastPostId: seed.postfastPostId,
      externalPostId: seed.externalPostId,
    })
    const existingById = seed.postId
      ? (posts.find((post) => post.id === seed.postId) ?? null)
      : null
    const claimed = resolveSuppliedClaims(posts, suppliedClaims)
    const claimedPost = claimed.at(0) ?? null

    if (existingById && claimedPost && existingById.id !== claimedPost.id) {
      throw new PostIdentityConflictError(
        `Post id "${seed.postId}" conflicts with an existing remote identity claim.`
      )
    }
    const current = existingById ?? claimedPost
    if (current) assertCompatibleIdentity(current, seed)

    const now = new Date().toISOString()
    const sourceType = current?.sourceType ?? seed.sourceType ?? "external"
    const sourceId =
      current?.sourceId ??
      seed.sourceId ??
      seed.externalPostId ??
      seed.postfastPostId ??
      deterministicExternalPostId(seed)
    const post: Post = {
      schemaVersion: 1,
      id: current?.id ?? seed.postId ?? deterministicExternalPostId(seed),
      intentId:
        current?.intentId ??
        (seed.postId
          ? `legacy:${seed.postId}`
          : `external:${seed.provider}:${seed.integrationId}:${seed.externalPostId}`),
      ownerId: seed.ownerId,
      origin: current?.origin ?? seed.origin,
      sourceType,
      sourceId,
      sourceRefs: current?.sourceRefs.length
        ? current.sourceRefs
        : [{ kind: "external", id: sourceId }],
      outputId: current?.outputId,
      automationId: current?.automationId,
      runId: current?.runId,
      sourceEntityId: current?.sourceEntityId,
      lifecycleStatus: "published",
      publishMode: current?.publishMode,
      linkState:
        current?.linkState === "postfast_managed"
          ? "postfast_managed"
          : "externally_linked",
      linkMethod: current?.linkMethod ?? seed.linkMethod,
      integrationId: seed.integrationId,
      provider: seed.provider,
      postfastPostId: seed.postfastPostId ?? current?.postfastPostId,
      externalPostId: seed.externalPostId ?? current?.externalPostId,
      releaseUrl: seed.releaseUrl ?? current?.releaseUrl,
      statsSources: [
        ...new Set([
          ...(current?.statsSources ?? []),
          ...(seed.statsSources ?? []),
        ]),
      ],
      title: current?.title,
      content: seed.content ?? current?.content ?? "",
      hashtags: current?.hashtags ?? [],
      contentType: seed.contentType ?? current?.contentType,
      media:
        current?.media.length || !seed.thumbnailUrl
          ? (current?.media ?? [])
          : [{ kind: "thumbnail", url: seed.thumbnailUrl, order: 0 }],
      generatedAt: current?.generatedAt,
      readyAt: current?.readyAt,
      scheduledAt: current?.scheduledAt,
      publishedAt: seed.publishedAt ?? current?.publishedAt,
      linkedAt: current?.linkedAt ?? now,
      failedAt: current?.failedAt,
      lastSyncedAt: now,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      mergedIntoId: current?.mergedIntoId,
    }

    return this.upsertPost(post)
  }

  async ensurePostForSnapshot(snapshot: SnapshotPostSeed): Promise<Post> {
    const ownerId = await outputPublicationsOwnerId()
    const seed = normalizeSnapshotSeed(snapshot)
    return this.resolveOrCreateExternalPost({
      ownerId,
      provider: seed.provider,
      integrationId: seed.integrationId,
      externalPostId: seed.externalPostId ?? seed.postfastPostId ?? seed.postId,
      postId: seed.postId,
      postfastPostId: seed.postfastPostId,
      origin:
        seed.source === "tiktok_studio"
          ? "tiktok_studio_import"
          : "postfast_sync",
      linkMethod:
        seed.source === "tiktok_studio" ? "tiktok_studio" : "analytics_sync",
      sourceType: seed.sourceType,
      sourceId: seed.sourceId,
      publishedAt: seed.publishedAt,
      releaseUrl: seed.releaseUrl,
      content: seed.content,
      contentType: seed.contentType,
      thumbnailUrl: seed.thumbnailUrl,
    })
  }

  addStatsSources(
    sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
  ): Promise<number> {
    if (postRepositoryWriteMode() === "canonical") {
      return this.addCanonicalStatsSources(sourcesByPostId)
    }
    return addPostFastPostStatsSources(sourcesByPostId)
  }

  private async addCanonicalStatsSources(
    sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
  ) {
    let changed = 0
    for (const [postId, incoming] of sourcesByPostId) {
      const current = await this.getPost(postId)
      if (!current) continue
      const statsSources = [...new Set([...current.statsSources, ...incoming])]
      if (statsSources.length === current.statsSources.length) continue
      await this.patchPost(postId, { statsSources })
      changed += 1
    }
    return changed
  }
}

export const postRepository: PostRepository = new ConfiguredPostRepository()

export function listPosts() {
  return postRepository.listPosts()
}

export function getPost(id: string) {
  return postRepository.getPost(id)
}

export function upsertPost(post: Post) {
  return postRepository.upsertPost(post)
}

export function claimPostIdentity(
  postId: string,
  claim: PostIdentityClaim
) {
  return postRepository.claimPostIdentity(postId, claim)
}

export function patchPost(id: string, patch: PostPatch) {
  return postRepository.patchPost(id, patch)
}

export function resolveOrCreateExternalPost(seed: ExternalPostSeed) {
  return postRepository.resolveOrCreateExternalPost(seed)
}

export function ensurePostForSnapshot(snapshot: SnapshotPostSeed) {
  return postRepository.ensurePostForSnapshot(snapshot)
}

export function addPostStatsSources(
  sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
) {
  return postRepository.addStatsSources(sourcesByPostId)
}

export type PostRepositoryShadowDiff = {
  missingCanonicalIds: string[]
  missingLegacyIds: string[]
  mismatched: Array<{ id: string; fields: string[] }>
}

export function postRepositoryShadowDiff(
  legacy: Post[],
  canonical: Post[]
): PostRepositoryShadowDiff {
  const legacyById = new Map(legacy.map((post) => [post.id, post]))
  const canonicalById = new Map(canonical.map((post) => [post.id, post]))
  const missingCanonicalIds = [...legacyById.keys()]
    .filter((id) => !canonicalById.has(id))
    .sort()
  const missingLegacyIds = [...canonicalById.keys()]
    .filter((id) => !legacyById.has(id))
    .sort()
  const mismatched = [...legacyById.keys()]
    .flatMap((id) => {
      const legacyPost = legacyById.get(id)
      const canonicalPost = canonicalById.get(id)
      if (!legacyPost || !canonicalPost) return []
      const legacyProjection = compatibilityProjection(legacyPost)
      const canonicalProjection = compatibilityProjection(canonicalPost)
      const fields = [
        ...new Set([
          ...Object.keys(legacyProjection),
          ...Object.keys(canonicalProjection),
        ]),
      ]
        .filter(
          (field) =>
            JSON.stringify(legacyProjection[field]) !==
            JSON.stringify(canonicalProjection[field])
        )
        .sort()
      return fields.length ? [{ id, fields }] : []
    })
    .sort((left, right) => left.id.localeCompare(right.id))
  return { missingCanonicalIds, missingLegacyIds, mismatched }
}

export function logPostRepositoryShadowDiff(
  ownerId: string,
  legacy: Post[],
  canonical: Post[]
) {
  const diff = postRepositoryShadowDiff(legacy, canonical)
  if (
    diff.missingCanonicalIds.length === 0 &&
    diff.missingLegacyIds.length === 0 &&
    diff.mismatched.length === 0
  ) {
    return
  }
  console.warn(
    JSON.stringify({
      event: "post_repository_shadow_diff",
      ownerId,
      legacyCount: legacy.length,
      canonicalCount: canonical.length,
      diff,
    })
  )
}

function resolveSuppliedClaims(
  posts: Post[],
  suppliedClaims: PostIdentityClaim[]
): Post[] {
  const strongClaims = suppliedClaims.filter(
    (claim) => claim.kind === "postfast" || claim.kind === "provider_external"
  )
  const resolved = new Map<string, Post>()
  for (const claim of strongClaims) {
    const matches = posts.filter((post) =>
      postIdentityClaimsForPost(post).some(
        (candidate) =>
          candidate.kind === claim.kind && candidate.key === claim.key
      )
    )
    if (matches.length > 1) {
      throw new PostIdentityConflictError(
        `Multiple posts claim the same ${claim.kind} identity.`
      )
    }
    if (matches[0]) resolved.set(matches[0].id, matches[0])
  }
  if (resolved.size > 1) {
    throw new PostIdentityConflictError(
      "The supplied remote identities resolve to different posts."
    )
  }
  return [...resolved.values()]
}

function assertCompatibleIdentity(
  post: Post,
  seed: ReturnType<typeof normalizeExternalPostSeed>
) {
  const samePostfastIdentity = Boolean(
    post.postfastPostId &&
      seed.postfastPostId &&
      post.postfastPostId === seed.postfastPostId
  )
  if (
    post.integrationId &&
    post.integrationId !== seed.integrationId &&
    !samePostfastIdentity
  ) {
    throw new PostIdentityConflictError(
      `Post "${post.id}" belongs to a different integration.`
    )
  }
  if (
    post.provider &&
    normalizeIdentityProvider(post.provider) !==
      normalizeIdentityProvider(seed.provider)
  ) {
    throw new PostIdentityConflictError(
      `Post "${post.id}" belongs to a different provider.`
    )
  }
  if (
    post.externalPostId &&
    seed.externalPostId &&
    post.externalPostId !== seed.externalPostId
  ) {
    throw new PostIdentityConflictError(
      `Post "${post.id}" already claims a different external post id.`
    )
  }
}

function normalizeExternalPostSeed(input: ExternalPostSeed) {
  const ownerId = clean(input.ownerId)
  const integrationId = clean(input.integrationId)
  const provider = normalizePostProvider(input.provider)
  const externalPostId = clean(input.externalPostId)
  if (!ownerId || !integrationId || !provider || !externalPostId) {
    throw new Error(
      "A post owner, integration, supported provider, and external post id are required."
    )
  }
  return {
    ownerId,
    integrationId,
    provider,
    externalPostId,
    postId: clean(input.postId) || undefined,
    postfastPostId: clean(input.postfastPostId) || undefined,
    origin: input.origin,
    linkMethod: input.linkMethod,
    sourceType: normalizeSourceType(input.sourceType),
    sourceId: clean(input.sourceId) || undefined,
    publishedAt: clean(input.publishedAt) || undefined,
    releaseUrl: clean(input.releaseUrl) || undefined,
    content: clean(input.content) || undefined,
    contentType: input.contentType,
    thumbnailUrl: clean(input.thumbnailUrl) || undefined,
    statsSources: input.statsSources,
  }
}

function deterministicExternalPostId(
  seed: ReturnType<typeof normalizeExternalPostSeed>
) {
  return `external-${crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        seed.ownerId,
        normalizeIdentityProvider(seed.provider),
        seed.integrationId,
        seed.externalPostId,
      ])
    )
    .digest("hex")
    .slice(0, 24)}`
}

function normalizeSnapshotSeed(snapshot: SnapshotPostSeed) {
  const postId = clean(snapshot.postId)
  const integrationId = clean(snapshot.integrationId)
  const provider = normalizePostProvider(snapshot.provider)
  if (!postId || !integrationId || !provider) {
    throw new Error(
      "A snapshot post id, integration, and supported provider are required."
    )
  }
  return {
    postId,
    integrationId,
    provider,
    postfastPostId: clean(snapshot.postfastPostId) || undefined,
    externalPostId: clean(snapshot.platformPostId) || undefined,
    capturedAt: clean(snapshot.capturedAt),
    publishedAt: clean(snapshot.publishedAt) || undefined,
    content: clean(snapshot.content) || undefined,
    thumbnailUrl: clean(snapshot.thumbnailUrl) || undefined,
    releaseUrl: clean(snapshot.releaseUrl) || undefined,
    sourceType: normalizeSourceType(snapshot.sourceType),
    sourceId: clean(snapshot.sourceId) || undefined,
    contentType: normalizeContentType(snapshot.contentType),
    source:
      snapshot.source === "tiktok_studio"
        ? ("tiktok_studio" as const)
        : ("postfast" as const),
  }
}

function normalizeSourceType(
  value: string | undefined
): PostFastSourceType | undefined {
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

function normalizeContentType(
  value: PostContentType | undefined
): Post["contentType"] {
  return value === "slideshow" ||
    value === "video" ||
    value === "image" ||
    value === "text"
    ? value
    : undefined
}

function normalizeRepositoryPost(post: Post): Post {
  const normalized = normalizePost(post)
  if (!normalized) throw new Error("A valid canonical post is required.")
  return normalized
}

function compatibilityProjection(post: Post): Record<string, unknown> {
  try {
    return postToPostFastRecord(post) as unknown as Record<string, unknown>
  } catch (error) {
    return {
      id: post.id,
      unprojectable:
        error instanceof Error ? error.message : "Legacy projection failed.",
    }
  }
}
