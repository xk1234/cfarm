import { createHash, randomUUID } from "node:crypto"

import { clean } from "@/lib/guards"
import { outputPublicationsOwnerId } from "@/lib/output-publications"
import { postRepositoryWriteMode } from "@/lib/post-repository-config"
import { postRepository } from "@/lib/post-repository"
import type { PostFastMedia } from "@/lib/postfast-client"
import type {
  PostFastPostRecord,
  PostFastPostStatus,
  PostFastSourceType,
  PostFastStatsSource,
} from "@/lib/postfast-posts"
import {
  lifecycleFromPostFastStatus,
  postToPostFastRecord,
  type Post,
  type PostOrigin,
  type PostSourceRef,
} from "@/lib/posts"

export type PublicationPostInput = {
  sourceType: PostFastSourceType
  sourceId: string
  integrationId: string
  provider: string
  status: PostFastPostStatus
  content: string
  media: PostFastMedia[]
  postId?: string
  intentId?: string
  outputId?: string
  automationId?: string
  runId?: string
  sourceEntityId?: string
  origin?: PostOrigin
  postfastPostId?: string
  scheduledAt?: string
  publishedAt?: string
  releaseUrl?: string
  externalPostId?: string
  linkState?: PostFastPostRecord["linkState"]
  statsSources?: readonly PostFastStatsSource[]
  error?: string
  now?: Date
}

export type GeneratedPostIntentInput = {
  sourceType: PostFastSourceType
  sourceId: string
  outputId: string
  content: string
  media?: Array<{ kind: "image" | "video" | "thumbnail"; url: string }>
  automationId?: string
  runId?: string
  sourceEntityId?: string
  publishMode?: Post["publishMode"]
  destinations?: ReadonlyArray<{
    integrationId: string
    provider: string
  }>
  generatedAt?: string
}

/**
 * Canonical publication writer used by web, automation, composer, and MCP
 * publishing paths. The repository owns storage-mode projection and identity
 * claims; this function only maps the business event into a Post.
 */
export async function upsertPublicationPost(
  input: PublicationPostInput
): Promise<PostFastPostRecord> {
  const ownerId = await outputPublicationsOwnerId()
  const posts = await postRepository.listPosts()
  const sourceType = input.sourceType
  const sourceId = clean(input.sourceId)
  const integrationId = clean(input.integrationId)
  const suppliedIntentId = clean(input.intentId)
  const outputId = clean(input.outputId)
  const hasOutputDestination = posts.some(
    (post) =>
      (post.outputId === outputId || post.sourceId === outputId) &&
      Boolean(post.integrationId)
  )
  const intentId =
    suppliedIntentId ||
    (outputId && !hasOutputDestination
      ? unassignedIntentId(outputId)
      : destinationIntentId({
          sourceType,
          sourceId,
          outputId,
          integrationId,
        }))
  const legacyMode = postRepositoryWriteMode() === "legacy"
  const existing =
    (clean(input.postId)
      ? posts.find((post) => post.id === clean(input.postId))
      : undefined) ??
    posts.find((post) => post.intentId === intentId) ??
    (!suppliedIntentId || legacyMode
      ? posts.find(
          (post) =>
            post.sourceType === sourceType &&
            post.sourceId === sourceId &&
            post.integrationId === integrationId
        )
      : undefined) ??
    posts.find(
      (post) =>
        Boolean(outputId) && post.outputId === outputId && !post.integrationId
    )
  const now = (input.now ?? new Date()).toISOString()
  const lifecycle = lifecycleFromPostFastStatus(input.status)
  const post: Post = {
    schemaVersion: 1,
    id: existing?.id ?? randomUUID(),
    intentId: existing?.intentId ?? intentId,
    ownerId,
    origin: existing?.origin ?? input.origin ?? "postfast_publish",
    sourceType,
    sourceId,
    sourceRefs: mergeSourceRefs(
      existing?.sourceRefs ?? [],
      publicationSourceRefs(input)
    ),
    outputId: outputId || existing?.outputId,
    automationId: clean(input.automationId) || existing?.automationId,
    runId: clean(input.runId) || existing?.runId,
    sourceEntityId: clean(input.sourceEntityId) || existing?.sourceEntityId,
    lifecycleStatus: lifecycle.lifecycleStatus,
    publishMode: lifecycle.publishMode ?? existing?.publishMode,
    linkState: canonicalLinkState(input.linkState ?? legacyLinkState(existing)),
    linkMethod:
      input.linkState === "manually_linked"
        ? "manual_url"
        : input.linkState === "postfast_published"
          ? "postfast"
          : existing?.linkMethod,
    integrationId,
    provider: input.provider as Post["provider"],
    postfastPostId: clean(input.postfastPostId) || existing?.postfastPostId,
    externalPostId: clean(input.externalPostId) || existing?.externalPostId,
    releaseUrl: clean(input.releaseUrl) || existing?.releaseUrl,
    statsSources: normalizeStatsSources(
      input.statsSources ?? existing?.statsSources
    ),
    title: existing?.title,
    content: input.content,
    hashtags: existing?.hashtags ?? [],
    contentType: contentTypeForMedia(input.media) ?? existing?.contentType,
    media: input.media.map((item, index) => ({
      kind: item.type === "VIDEO" ? "video" : "image",
      postfastKey: item.key,
      order: item.sortOrder ?? index,
    })),
    generatedAt: existing?.generatedAt,
    readyAt: existing?.readyAt,
    scheduledAt: clean(input.scheduledAt) || undefined,
    publishedAt:
      clean(input.publishedAt) ||
      (input.status === "published"
        ? (existing?.publishedAt ?? now)
        : existing?.publishedAt),
    linkedAt:
      input.linkState === "manually_linked"
        ? (existing?.linkedAt ?? now)
        : existing?.linkedAt,
    failedAt: input.status === "failed" ? now : existing?.failedAt,
    lastSyncedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    error: clean(input.error)
      ? { message: clean(input.error), retryable: true }
      : undefined,
    mergedIntoId: existing?.mergedIntoId,
  }

  return postToPostFastRecord(await postRepository.upsertPost(post))
}

/**
 * Creates ready post intents once generated media is usable. Legacy mode is a
 * deliberate no-op so enabling Stage 4a cannot add draft publication rows for
 * existing readers. Dual/canonical modes persist through PostRepository.
 */
export async function upsertGeneratedPostIntents(
  input: GeneratedPostIntentInput
): Promise<Post[]> {
  if (postRepositoryWriteMode() === "legacy") return []
  const ownerId = await outputPublicationsOwnerId()
  const posts = buildGeneratedPostIntents(input, ownerId)
  return Promise.all(posts.map((post) => postRepository.upsertPost(post)))
}

/** Pure mapping used by storage-stage composites before any identity/post call. */
export function buildGeneratedPostIntents(
  input: GeneratedPostIntentInput,
  ownerId: string
): Post[] {
  const generatedAt = clean(input.generatedAt) || new Date().toISOString()
  const destinations = (input.destinations ?? []).filter(
    (destination) =>
      clean(destination.integrationId) && clean(destination.provider)
  )
  const targets = destinations.length ? destinations : [null]
  return targets.map((destination): Post => {
    const intentId = destination
      ? destinationIntentId({
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          outputId: input.outputId,
          integrationId: destination.integrationId,
        })
      : unassignedIntentId(input.outputId)
    return {
      schemaVersion: 1,
      id: `intent-${createHash("sha256").update(`${ownerId}:${intentId}`).digest("hex").slice(0, 28)}`,
      intentId,
      ownerId,
      origin: "automation_generation",
      sourceType: input.sourceType,
      sourceId: clean(input.sourceId),
      sourceRefs: publicationSourceRefs(input),
      outputId: clean(input.outputId),
      automationId: clean(input.automationId) || undefined,
      runId: clean(input.runId) || undefined,
      sourceEntityId: clean(input.sourceEntityId) || undefined,
      lifecycleStatus: "ready",
      publishMode: input.publishMode,
      linkState: "unlinked",
      integrationId: destination ? clean(destination.integrationId) : undefined,
      provider: destination?.provider as Post["provider"],
      statsSources: [],
      content: clean(input.content),
      hashtags: [],
      contentType: generatedContentType(input),
      media: (input.media ?? []).flatMap((item, index) => {
        const url = clean(item.url)
        return url ? [{ kind: item.kind, url, order: index }] : []
      }),
      generatedAt,
      readyAt: generatedAt,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }
  })
}

export async function markOutputPostPublished(input: {
  sourceType: PostFastSourceType
  sourceId: string
  outputId: string
  content: string
  publishedAt: string
  media?: Array<{ kind: "image" | "video" | "thumbnail"; url: string }>
  automationId?: string
  runId?: string
  sourceEntityId?: string
  publication?: PostFastPostRecord
}) {
  if (postRepositoryWriteMode() === "legacy") return null
  if (input.publication) {
    return upsertPublicationPost({
      ...input.publication,
      postId: input.publication.id,
      outputId: input.outputId,
      automationId: input.automationId,
      runId: input.runId,
      sourceEntityId: input.sourceEntityId,
      origin: "manual_link",
      publishedAt: input.publishedAt,
    })
  }
  const [post] = await upsertGeneratedPostIntents({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    outputId: input.outputId,
    content: input.content,
    media: input.media,
    automationId: input.automationId,
    runId: input.runId,
    sourceEntityId: input.sourceEntityId,
    generatedAt: input.publishedAt,
  })
  if (!post) return null
  return postRepository.upsertPost({
    ...post,
    origin: "manual_link",
    lifecycleStatus: "published",
    linkState: "externally_linked",
    publishedAt: input.publishedAt,
    linkedAt: input.publishedAt,
    updatedAt: input.publishedAt,
  })
}

export function destinationIntentId(input: {
  sourceType: PostFastSourceType
  sourceId: string
  outputId?: string
  integrationId: string
}) {
  return [
    "destination",
    clean(input.outputId) || `${input.sourceType}:${clean(input.sourceId)}`,
    clean(input.integrationId),
  ].join(":")
}

function unassignedIntentId(outputId: string) {
  return `unassigned:${clean(outputId)}`
}

function publicationSourceRefs(input: {
  sourceType: PostFastSourceType
  sourceId: string
  outputId?: string
  automationId?: string
  runId?: string
  sourceEntityId?: string
}): PostSourceRef[] {
  const refs: PostSourceRef[] = []
  const add = (kind: PostSourceRef["kind"], id: string | undefined) => {
    const normalized = clean(id)
    if (normalized) refs.push({ kind, id: normalized })
  }
  add("output", input.outputId)
  add("automation", input.automationId)
  add("run", input.runId)
  if (input.sourceType === "automation") add("run", input.sourceId)
  else if (input.sourceType === "slideshow") add("slideshow", input.sourceId)
  else if (
    input.sourceType === "generated_video" ||
    input.sourceType === "greenscreen" ||
    input.sourceType === "ugc_ad"
  ) {
    add("generated_video", input.sourceId)
  } else if (input.sourceType === "x_automation") {
    add("x_automation", input.sourceId)
  } else {
    add("external", input.sourceEntityId ?? input.sourceId)
  }
  return mergeSourceRefs([], refs)
}

function mergeSourceRefs(left: PostSourceRef[], right: PostSourceRef[]) {
  return [
    ...new Map(
      [...left, ...right].map((reference) => [
        `${reference.kind}:${reference.id}`,
        reference,
      ])
    ).values(),
  ]
}

function canonicalLinkState(value: PostFastPostRecord["linkState"]) {
  if (value === "postfast_published") return "postfast_managed" as const
  if (value === "manually_linked") return "externally_linked" as const
  return "unlinked" as const
}

function legacyLinkState(post: Post | undefined) {
  if (post?.linkState === "postfast_managed") return "postfast_published"
  if (post?.linkState === "externally_linked") return "manually_linked"
  return "unlinked"
}

function normalizeStatsSources(values: readonly PostFastStatsSource[] = []) {
  const sources = new Set(values)
  return (["postfast", "tiktok_studio"] as const).filter((source) =>
    sources.has(source)
  )
}

function contentTypeForMedia(media: PostFastMedia[]): Post["contentType"] {
  if (media.some((item) => item.type === "VIDEO")) return "video"
  if (media.length > 1) return "slideshow"
  return media.length === 1 ? "image" : "text"
}

function generatedContentType(
  input: GeneratedPostIntentInput
): Post["contentType"] {
  if (input.sourceType === "slideshow") return "slideshow"
  if (
    input.sourceType === "generated_video" ||
    input.sourceType === "greenscreen" ||
    input.sourceType === "ugc_ad"
  ) {
    return "video"
  }
  if (input.media?.some((item) => item.kind === "video")) return "video"
  return input.media?.length ? "image" : "text"
}
