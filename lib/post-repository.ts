import crypto from "node:crypto"

import { clean } from "@/lib/guards"
import {
  outputPublicationsOwnerId,
  writeCanonicalPostWithLegacyProjection,
} from "@/lib/output-publications"
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
  deletePostFastPostRecordById,
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

export type DeletePostsInput = {
  sourceType?: PostFastSourceType
  sourceIds?: string[]
  integrationIds?: string[]
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
  deletePost(id: string): Promise<Post | null>
  deletePosts(input: DeletePostsInput): Promise<Post[]>
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
    const mode = postRepositoryWriteMode()
    if (mode === "canonical") {
      return appwritePostRepository.upsertPost(normalized, {
        writeState: "reconciled",
      })
    }
    if (
      mode === "dual" &&
      (!normalized.sourceType ||
        !normalized.sourceId ||
        !normalized.integrationId ||
        !normalized.provider)
    ) {
      return appwritePostRepository.upsertPost(normalized, {
        writeState: "reconciled",
      })
    }
    const projected = postToPostFastRecord(normalized)
    const existing = (await listPostFastPostRecords()).find(
      (record) => record.id === projected.id
    )
    const legacyRecord = {
      ...projected,
      analytics: existing?.analytics,
      lastAnalyticsSyncedAt: existing?.lastAnalyticsSyncedAt,
    }
    if (mode === "dual") {
      return writeCanonicalPostWithLegacyProjection(normalized, legacyRecord)
    }
    await putPostFastPostRecord(legacyRecord)
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

  async deletePost(id: string): Promise<Post | null> {
    const mode = postRepositoryWriteMode()
    const current =
      (await this.getPost(id)) ??
      (mode !== "legacy"
        ? await appwritePostRepository.getPost(
            await outputPublicationsOwnerId(),
            id
          )
        : null)
    if (!current) return null
    if (mode !== "legacy") {
      await appwritePostRepository.deletePost(current.ownerId, current.id)
    }
    if (mode !== "canonical") {
      await deletePostFastPostRecordById(current.id)
    }
    return current
  }

  async deletePosts(input: DeletePostsInput): Promise<Post[]> {
    const sourceIds = new Set(
      (input.sourceIds ?? []).map(clean).filter(Boolean)
    )
    const integrationIds = new Set(
      (input.integrationIds ?? []).map(clean).filter(Boolean)
    )
    if (
      !input.sourceType &&
      sourceIds.size === 0 &&
      integrationIds.size === 0
    ) {
      return []
    }
    const visible = await this.listPosts()
    const ownerId = await outputPublicationsOwnerId()
    const canonical =
      postRepositoryWriteMode() === "legacy"
        ? []
        : await appwritePostRepository.listPosts(ownerId)
    const posts = [
      ...new Map(
        [...visible, ...canonical].map((post) => [post.id, post])
      ).values(),
    ].filter((post) => {
      if (input.sourceType && post.sourceType !== input.sourceType) return false
      if (
        sourceIds.size > 0 &&
        !sourceIds.has(post.sourceId ?? "") &&
        !sourceIds.has(baseSourceId(post.sourceId))
      ) {
        return false
      }
      return (
        integrationIds.size === 0 ||
        integrationIds.has(post.integrationId ?? "")
      )
    })
    const deleted: Post[] = []
    for (const post of posts) {
      const result = await this.deletePost(post.id)
      if (result) deleted.push(result)
    }
    return deleted
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

export type PostReadProjectionInput<T> = {
  surface: string
  legacy: () => Promise<T>
  canonical: (posts: Post[]) => T | Promise<T>
}

/**
 * Keeps a reader's existing legacy query and response adapter intact while
 * allowing that surface to shadow or return the same projection from Posts.
 */
export async function readPostProjection<T>(
  input: PostReadProjectionInput<T>
): Promise<T> {
  const mode = postRepositoryReadMode()
  if (mode === "legacy") return input.legacy()

  if (mode === "canonical") {
    const ownerId = await outputPublicationsOwnerId()
    return input.canonical(await appwritePostRepository.listPosts(ownerId))
  }

  const legacy = await input.legacy()
  try {
    const ownerId = await outputPublicationsOwnerId()
    const canonical = await input.canonical(
      await appwritePostRepository.listPosts(ownerId)
    )
    logPostReadProjectionDiff({
      surface: input.surface,
      ownerId,
      legacy,
      canonical,
    })
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "post_read_projection_shadow_error",
        surface: input.surface,
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }
  return legacy
}

export type PublicationReadFilters = {
  sourceType?: PostFastSourceType
  sourceIds?: string[]
  integrationId?: string
}

export function listPublicationRecordsForRead(input: {
  surface: string
  filters?: PublicationReadFilters
  legacy?: () => Promise<ReturnType<typeof postToPostFastRecord>[]>
}) {
  const filters = input.filters ?? {}
  return readPostProjection({
    surface: input.surface,
    legacy:
      input.legacy ??
      (() =>
        listPostFastPostRecords({
          sourceType: filters.sourceType,
          sourceIds: filters.sourceIds,
          integrationId: filters.integrationId,
        })),
    canonical: (posts) =>
      posts
        .filter((post) => postMatchesPublicationFilters(post, filters))
        .flatMap((post) => {
          const record = publicationRecordFromCanonicalPost(post, filters)
          return record ? [record] : []
        }),
  })
}

function publicationRecordFromCanonicalPost(
  post: Post,
  filters: PublicationReadFilters
) {
  // A Post without a destination was never a legacy publication and must not
  // leak into legacy-shaped reader APIs.
  if (!post.integrationId || !post.provider) return null
  const explicitSource = explicitFilteredSource(post, filters)
  const sourceReference = post.sourceRefs.find((reference) =>
    sourceTypeForReference(reference.kind)
  )
  const sourceType =
    explicitSource?.sourceType ??
    post.sourceType ??
    (sourceReference
      ? sourceTypeForReference(sourceReference.kind)
      : undefined) ??
    (post.origin === "postfast_sync" ||
    post.origin === "tiktok_publication_import" ||
    post.origin === "tiktok_studio_import"
      ? "external"
      : post.contentType === "slideshow"
        ? "slideshow"
        : post.contentType === "video"
          ? "generated_video"
          : "manual")
  const sourceId =
    explicitSource?.id ??
    post.sourceId ??
    post.outputId ??
    post.sourceEntityId ??
    post.runId ??
    sourceReference?.id ??
    post.externalPostId ??
    post.postfastPostId ??
    post.id
  try {
    return postToPostFastRecord({
      ...post,
      sourceType,
      sourceId,
    })
  } catch {
    return null
  }
}

export function getPublicationRecordForRead(input: {
  surface: string
  id: string
  legacy: () => Promise<ReturnType<typeof postToPostFastRecord> | null>
}) {
  return readPostProjection({
    surface: input.surface,
    legacy: input.legacy,
    canonical: (posts) => {
      const post = posts.find((candidate) => candidate.id === clean(input.id))
      if (!post) return null
      return publicationRecordFromCanonicalPost(post, {})
    },
  })
}

export function getPost(id: string) {
  return postRepository.getPost(id)
}

export function upsertPost(post: Post) {
  return postRepository.upsertPost(post)
}

export function claimPostIdentity(postId: string, claim: PostIdentityClaim) {
  return postRepository.claimPostIdentity(postId, claim)
}

export function patchPost(id: string, patch: PostPatch) {
  return postRepository.patchPost(id, patch)
}

export function deletePost(id: string) {
  return postRepository.deletePost(id)
}

export function deletePosts(input: DeletePostsInput) {
  return postRepository.deletePosts(input)
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

function postMatchesPublicationFilters(
  post: Post,
  filters: PublicationReadFilters
) {
  if (filters.sourceType && post.sourceType !== filters.sourceType) return false
  if (filters.integrationId && post.integrationId !== filters.integrationId) {
    return false
  }
  const sourceIds = new Set(
    (filters.sourceIds ?? []).map(clean).filter(Boolean)
  )
  if (sourceIds.size === 0) return true
  const candidates = [
    post.sourceId,
    post.outputId,
    post.automationId,
    post.runId,
    post.sourceEntityId,
    ...post.sourceRefs.map((ref) => ref.id),
  ]
    .map(clean)
    .filter(Boolean)
  return candidates.some(
    (candidate) =>
      sourceIds.has(candidate) || sourceIds.has(baseSourceId(candidate))
  )
}

function explicitFilteredSource(
  post: Post,
  filters: PublicationReadFilters
): { id: string; sourceType?: PostFastSourceType } | null {
  const requested = new Set(
    (filters.sourceIds ?? []).map(clean).filter(Boolean)
  )
  if (requested.size === 0) return null
  const references = [
    ...post.sourceRefs.map((ref) => ({
      id: clean(ref.id),
      sourceType: sourceTypeForReference(ref.kind),
    })),
    { id: clean(post.outputId), sourceType: post.sourceType },
    { id: clean(post.runId), sourceType: "automation" as const },
  ]
  return (
    references.find(
      (reference) =>
        reference.id &&
        (requested.has(reference.id) ||
          requested.has(baseSourceId(reference.id)))
    ) ?? null
  )
}

function sourceTypeForReference(
  kind: Post["sourceRefs"][number]["kind"]
): PostFastSourceType | undefined {
  if (kind === "run" || kind === "automation") return "automation"
  if (kind === "slideshow") return "slideshow"
  if (kind === "generated_video") return "generated_video"
  if (kind === "x_automation") return "x_automation"
  if (kind === "external") return "external"
  return undefined
}

function logPostReadProjectionDiff<T>(input: {
  surface: string
  ownerId: string
  legacy: T
  canonical: T
}) {
  const legacyJson = stableProjectionJson(input.legacy)
  const canonicalJson = stableProjectionJson(input.canonical)
  if (legacyJson === canonicalJson) return
  console.warn(
    JSON.stringify({
      event: "post_read_projection_shadow_diff",
      surface: input.surface,
      ownerId: input.ownerId,
      legacy: projectionSummary(input.legacy, legacyJson),
      canonical: projectionSummary(input.canonical, canonicalJson),
      diff: projectionValueDiff(input.legacy, input.canonical),
    })
  )
}

function projectionValueDiff(legacy: unknown, canonical: unknown) {
  if (Array.isArray(legacy) && Array.isArray(canonical)) {
    const legacyById = projectionItemsById(legacy)
    const canonicalById = projectionItemsById(canonical)
    if (legacyById.size > 0 || canonicalById.size > 0) {
      return {
        missingCanonicalIds: [...legacyById.keys()]
          .filter((id) => !canonicalById.has(id))
          .sort(),
        missingLegacyIds: [...canonicalById.keys()]
          .filter((id) => !legacyById.has(id))
          .sort(),
        mismatchedIds: [...legacyById.keys()]
          .filter(
            (id) =>
              canonicalById.has(id) &&
              stableProjectionJson(legacyById.get(id)) !==
                stableProjectionJson(canonicalById.get(id))
          )
          .sort(),
      }
    }
  }
  return { changed: true }
}

function projectionItemsById(items: unknown[]) {
  return new Map(
    items.flatMap((item) =>
      item &&
      typeof item === "object" &&
      "id" in item &&
      typeof item.id === "string"
        ? [[item.id, item] as const]
        : []
    )
  )
}

function projectionSummary(value: unknown, json: string) {
  return {
    kind: Array.isArray(value) ? "array" : typeof value,
    ...(Array.isArray(value) ? { count: value.length } : {}),
    ids: Array.isArray(value)
      ? value.flatMap((item) =>
          item &&
          typeof item === "object" &&
          "id" in item &&
          typeof item.id === "string"
            ? [item.id]
            : []
        )
      : [],
    digest: crypto.createHash("sha256").update(json).digest("hex").slice(0, 16),
  }
}

function stableProjectionJson(value: unknown) {
  return JSON.stringify(sortProjectionValue(value))
}

function sortProjectionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortProjectionValue)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortProjectionValue(entry)])
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

function baseSourceId(value: string | undefined) {
  return clean(value).split(":")[0] ?? ""
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
  return { ...normalized, content: post.content }
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
