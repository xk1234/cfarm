import { clean } from "@/lib/guards"
import { outputPublicationsOwnerId } from "@/lib/output-publications"
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

export interface PostRepository {
  listPosts(): Promise<Post[]>
  getPost(id: string): Promise<Post | null>
  ensurePostForSnapshot(snapshot: SnapshotPostSeed): Promise<Post>
  addStatsSources(
    sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
  ): Promise<number>
}

export class PostIdentityConflictError extends Error {
  readonly code = "post_identity_conflict"

  constructor(message: string) {
    super(message)
    this.name = "PostIdentityConflictError"
  }
}

class LegacyPostRepository implements PostRepository {
  async listPosts(): Promise<Post[]> {
    const [ownerId, records] = await Promise.all([
      outputPublicationsOwnerId(),
      listPostFastPostRecords(),
    ])
    return records.map((record) => postFromPostFastRecord(record, ownerId))
  }

  async getPost(id: string): Promise<Post | null> {
    const normalizedId = clean(id)
    if (!normalizedId) return null
    return (
      (await this.listPosts()).find((post) => post.id === normalizedId) ?? null
    )
  }

  async ensurePostForSnapshot(snapshot: SnapshotPostSeed): Promise<Post> {
    const ownerId = await outputPublicationsOwnerId()
    const posts = (await listPostFastPostRecords()).map((record) =>
      postFromPostFastRecord(record, ownerId)
    )
    const seed = normalizeSnapshotSeed(snapshot)
    const suppliedClaims = postIdentityClaims({
      ownerId,
      id: seed.postId,
      integrationId: seed.integrationId,
      provider: seed.provider,
      postfastPostId: seed.postfastPostId,
      externalPostId: seed.externalPostId,
    })
    const existingById = posts.find((post) => post.id === seed.postId) ?? null
    const claimed = resolveSuppliedClaims(posts, suppliedClaims)
    const claimedPost = claimed.at(0) ?? null

    if (existingById && claimedPost && existingById.id !== claimedPost.id) {
      throw new PostIdentityConflictError(
        `Snapshot post id "${seed.postId}" conflicts with an existing remote identity claim.`
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
      seed.postId
    const post: Post = {
      schemaVersion: 1,
      id: current?.id ?? seed.postId,
      intentId: current?.intentId ?? `legacy:${seed.postId}`,
      ownerId,
      origin:
        current?.origin ??
        (seed.source === "tiktok_studio"
          ? "tiktok_studio_import"
          : "postfast_sync"),
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
      linkMethod:
        current?.linkMethod ??
        (seed.source === "tiktok_studio" ? "tiktok_studio" : "analytics_sync"),
      integrationId: seed.integrationId,
      provider: seed.provider,
      postfastPostId: seed.postfastPostId ?? current?.postfastPostId,
      externalPostId: seed.externalPostId ?? current?.externalPostId,
      releaseUrl: seed.releaseUrl ?? current?.releaseUrl,
      statsSources: current?.statsSources ?? [],
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

    await putPostFastPostRecord(postToPostFastRecord(post))
    return post
  }

  addStatsSources(
    sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
  ) {
    return addPostFastPostStatsSources(sourcesByPostId)
  }
}

export const postRepository: PostRepository = new LegacyPostRepository()

export function listPosts() {
  return postRepository.listPosts()
}

export function getPost(id: string) {
  return postRepository.getPost(id)
}

export function ensurePostForSnapshot(snapshot: SnapshotPostSeed) {
  return postRepository.ensurePostForSnapshot(snapshot)
}

export function addPostStatsSources(
  sourcesByPostId: ReadonlyMap<string, readonly PostFastStatsSource[]>
) {
  return postRepository.addStatsSources(sourcesByPostId)
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
  seed: ReturnType<typeof normalizeSnapshotSeed>
) {
  if (post.integrationId && post.integrationId !== seed.integrationId) {
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
