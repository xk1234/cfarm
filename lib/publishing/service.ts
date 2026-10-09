/**
 * Publishing service: renders → SocialBu posts.
 *
 * One `posts` row is one render going to one SocialBu account. Publishing
 * uploads the rendered PNGs, creates the SocialBu post (with `publish_at` for
 * scheduled posts; SocialBu does the time-critical posting), and stores the
 * SocialBu post id on the row. A `publish-post` job retries failed submissions
 * and later syncs the post's status (published/failed) from SocialBu.
 *
 * Every function takes `workspaceId` explicitly and optional `deps` so tests
 * inject in-memory repositories, a mocked publisher and a fixed clock.
 */
import {
  getRepositories,
  sha256Hex,
  type Job,
  type Post,
  type PostStatus,
  type Render,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"
import { isRetryableSocialBuError } from "@/lib/socialbu-client"
import { notifyPostOutcome, schedulePostReminders } from "@/lib/notifications"

import { postbackUrl } from "./postback"
import {
  getPublisher,
  PublisherNotConfiguredError,
  type Publisher,
  type PublisherAccount,
  type PublisherPost,
  type PublisherPostStatus,
  type PublisherStatus,
} from "./publisher"

export type PublishingDeps = {
  repos?: Repositories
  publisher?: Publisher
  now?: () => Date
  env?: Record<string, string | undefined>
}

type Resolved = Required<Omit<PublishingDeps, "env">> & { env: Record<string, string | undefined> }

function resolve(deps: PublishingDeps = {}): Resolved {
  const env = deps.env ?? process.env
  return {
    repos: deps.repos ?? getRepositories(),
    publisher: deps.publisher ?? getPublisher(env),
    now: deps.now ?? (() => new Date()),
    env,
  }
}

/** Invalid request (bad render, unknown account, caption too long, …). */
export class PublishingInputError extends Error {
  readonly status: 400 | 404 | 409
  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message)
    this.name = "PublishingInputError"
    this.status = status
  }
}

/** Per-network limits checked before anything is uploaded. */
export const PROVIDER_LIMITS: Record<string, { maxMedia?: number; maxCaption?: number }> = {
  tiktok: { maxMedia: 35, maxCaption: 4000 },
  instagram: { maxMedia: 20, maxCaption: 2200 },
  facebook: { maxMedia: 30, maxCaption: 63206 },
  threads: { maxMedia: 20, maxCaption: 500 },
  x: { maxMedia: 4, maxCaption: 280 },
  bluesky: { maxMedia: 4, maxCaption: 300 },
  linkedin: { maxMedia: 20, maxCaption: 3000 },
  pinterest: { maxMedia: 5, maxCaption: 500 },
}

const TIKTOK_DEFAULT_PRIVACY = "PUBLIC_TO_EVERYONE"
/** Stop polling SocialBu for a post's outcome after this long past its publish time. */
const STATUS_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000
const FIRST_SYNC_DELAY_MS = 2 * 60 * 1000
const SYNC_INTERVAL_MS = 5 * 60 * 1000
const RETRY_DELAY_MS = 60 * 1000
/** A schedule time may be this far in the past (clock skew); later than that is rejected. */
const PAST_TOLERANCE_MS = 60 * 1000
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000

// ─────────────────────────────── status + accounts ───────────────────────────────

export function getPublishingStatus(deps: PublishingDeps = {}): PublisherStatus {
  return resolve(deps).publisher.status()
}

export type PublishingAccount = PublisherAccount & { disabled: boolean }

export type PublishingAccounts = { status: PublisherStatus; accounts: PublishingAccount[] }

export async function listPublishingAccounts(
  workspaceId: WorkspaceId,
  deps: PublishingDeps = {}
): Promise<PublishingAccounts> {
  const { repos, publisher } = resolve(deps)
  const status = publisher.status()
  if (!publisher.configured) return { status, accounts: [] }
  const [accounts, settings] = await Promise.all([publisher.listAccounts(), repos.settings.get(workspaceId)])
  const disabled = new Set(settings.disabledAccountIds)
  return { status, accounts: accounts.map((account) => ({ ...account, disabled: disabled.has(account.id) })) }
}

/** Hides (or shows again) a SocialBu account in the publish dialog. */
export async function setAccountDisabled(
  workspaceId: WorkspaceId,
  accountId: string,
  disabled: boolean,
  deps: PublishingDeps = {}
): Promise<string[]> {
  const { repos } = resolve(deps)
  const settings = await repos.settings.get(workspaceId)
  const ids = new Set(settings.disabledAccountIds)
  if (disabled) ids.add(accountId)
  else ids.delete(accountId)
  const saved = await repos.settings.patch(workspaceId, { disabledAccountIds: [...ids].sort() })
  return saved.disabledAccountIds
}

// ─────────────────────────────── publish ───────────────────────────────

export type PublishRenderInput = {
  renderId: string
  accountIds: string[]
  caption: string
  /** ISO 8601; null/omitted = publish now. */
  publishAt?: string | null
  /** SocialBu `options` per provider (`{ tiktok: { privacy_status } }`). */
  platformOptions?: Record<string, Record<string, unknown>>
  createdBy: string
  /** Client idempotency key (e.g. one per dialog submission). */
  idempotencyKey?: string | null
}

export type PublishRenderResult = { posts: Post[] }

function assertPublisher(publisher: Publisher) {
  if (!publisher.configured) throw new PublisherNotConfiguredError()
}

function normalizePublishAt(value: string | null | undefined, now: Date): string | null {
  if (!value) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) throw new PublishingInputError("Choose a valid publish time.")
  if (ms < now.getTime() - PAST_TOLERANCE_MS) throw new PublishingInputError("Choose a future publish time.")
  if (ms > now.getTime() + MAX_SCHEDULE_AHEAD_MS) {
    throw new PublishingInputError("Posts can be scheduled at most a year ahead.")
  }
  // Within the tolerance window "now" is meant.
  return ms <= now.getTime() ? null : new Date(ms).toISOString()
}

function publishableSlides(render: Render) {
  if (render.status !== "succeeded" || !render.output?.slides.length) {
    throw new PublishingInputError("Only finished renders can be published.", 409)
  }
  return [...render.output.slides].sort((a, b) => a.index - b.index)
}

/** TikTok requires `privacy_status`; default to public when the account allows it. */
export function buildPlatformOptions(
  account: PublisherAccount,
  provided: Record<string, unknown> | undefined
): Record<string, unknown> {
  const options = { ...(provided ?? {}) }
  if (account.provider === "tiktok") {
    const creatorInfo = account.extra.creator_info as { privacy_level_options?: unknown } | undefined
    const allowed = Array.isArray(creatorInfo?.privacy_level_options)
      ? creatorInfo!.privacy_level_options.filter((v): v is string => typeof v === "string")
      : []
    const requested = typeof options.privacy_status === "string" ? options.privacy_status : ""
    if (requested && allowed.length && !allowed.includes(requested)) {
      throw new PublishingInputError(`TikTok account "${account.name}" does not allow privacy "${requested}".`)
    }
    if (!requested) {
      options.privacy_status = allowed.length
        ? allowed.includes(TIKTOK_DEFAULT_PRIVACY)
          ? TIKTOK_DEFAULT_PRIVACY
          : allowed[0]
        : TIKTOK_DEFAULT_PRIVACY
    }
  }
  return options
}

function intentKeyFor(input: PublishRenderInput, accountId: string, publishAt: string | null, now: Date): string {
  const slot = input.idempotencyKey?.trim()
    ? `key:${input.idempotencyKey.trim()}`
    : publishAt
      ? `at:${publishAt}`
      : `now:${now.toISOString().slice(0, 16)}`
  return sha256Hex(`${input.renderId}:${accountId}:${slot}`)
}

/**
 * Creates one post row per account and submits each to SocialBu. A retryable
 * SocialBu failure (rate limit/outage) leaves the row pending and queues a
 * `publish-post` retry; a rejected post is marked `failed`.
 */
export async function publishRender(
  workspaceId: WorkspaceId,
  input: PublishRenderInput,
  deps: PublishingDeps = {}
): Promise<PublishRenderResult> {
  const resolved = resolve(deps)
  const { repos, publisher, now } = resolved
  assertPublisher(publisher)

  const accountIds = [...new Set(input.accountIds.map((id) => id.trim()).filter(Boolean))]
  if (!accountIds.length) throw new PublishingInputError("Choose at least one account.")
  const caption = input.caption.trim()

  const render = await repos.renders.get(workspaceId, input.renderId)
  if (!render) throw new PublishingInputError("Render not found.", 404)
  const slides = publishableSlides(render)
  const scheduledAt = normalizePublishAt(input.publishAt, now())

  const [accounts, settings] = await Promise.all([publisher.listAccounts(), repos.settings.get(workspaceId)])
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const disabled = new Set(settings.disabledAccountIds)
  const targets = accountIds.map((id) => {
    const account = byId.get(id)
    if (!account || disabled.has(id)) throw new PublishingInputError(`SocialBu account ${id} is not available.`)
    if (!account.active) {
      throw new PublishingInputError(`${account.name} is disconnected in SocialBu. Reconnect it and try again.`)
    }
    const limits = PROVIDER_LIMITS[account.provider]
    if (limits?.maxMedia && slides.length > limits.maxMedia) {
      throw new PublishingInputError(
        `${account.name} accepts at most ${limits.maxMedia} images per post; this render has ${slides.length}.`
      )
    }
    if (limits?.maxCaption && caption.length > limits.maxCaption) {
      throw new PublishingInputError(`The caption is longer than ${limits.maxCaption} characters for ${account.name}.`)
    }
    return { account, options: buildPlatformOptions(account, input.platformOptions?.[account.provider]) }
  })

  const posts: Post[] = []
  for (const { account, options } of targets) {
    const { value: post, created } = await repos.posts.upsertIntent(workspaceId, {
      renderId: render.id,
      provider: account.provider,
      accountId: account.id,
      status: scheduledAt ? "scheduled" : "publishing",
      // Publish-now posts record the submission time so the calendar shows them.
      publishAt: scheduledAt ?? now().toISOString(),
      caption,
      platformOptions: options,
      intentKey: intentKeyFor(input, account.id, scheduledAt, now()),
      createdBy: input.createdBy,
    })
    if (!created && (post.providerPostId || post.status === "canceled")) {
      posts.push(post)
      continue
    }
    posts.push(await submitPostSafely(workspaceId, post, resolved))
  }
  return { posts }
}

/** Submits and converts failures into row state (used by the request path). */
async function submitPostSafely(workspaceId: WorkspaceId, post: Post, deps: Resolved): Promise<Post> {
  try {
    return await submitPost(workspaceId, post.id, deps)
  } catch (error) {
    if (error instanceof PublisherNotConfiguredError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (isRetryableSocialBuError(error)) {
      const updated = await deps.repos.posts.update(workspaceId, post.id, { error: message })
      await enqueuePublishJob(workspaceId, post.id, new Date(deps.now().getTime() + RETRY_DELAY_MS), deps)
      return updated
    }
    return markFailed(workspaceId, post.id, message, deps)
  }
}

/**
 * Uploads the render's slides and creates the SocialBu post. Idempotent: a
 * row that already has a SocialBu post id (or was canceled) is returned as is.
 * Throws SocialBu errors to the caller.
 */
export async function submitPost(workspaceId: WorkspaceId, postId: string, deps: PublishingDeps = {}): Promise<Post> {
  const resolved = resolve(deps)
  const { repos, publisher, now, env } = resolved
  assertPublisher(publisher)

  const post = await repos.posts.get(workspaceId, postId)
  if (!post) throw new PublishingInputError("Post not found.", 404)
  if (post.providerPostId || post.status === "canceled" || post.status === "published") return post

  const render = await repos.renders.get(workspaceId, post.renderId)
  if (!render) throw new PublishingInputError("The render for this post was deleted.", 404)
  const slides = publishableSlides(render)

  const tokens: string[] = []
  for (const slide of slides) {
    const blob = await repos.blobs.get(workspaceId, "renders", slide.fileId)
    if (!blob) throw new PublishingInputError(`Rendered slide ${slide.index + 1} is missing.`, 409)
    const extension = slide.mime === "image/jpeg" ? "jpg" : slide.mime === "image/webp" ? "webp" : "png"
    const uploaded = await publisher.uploadMedia({
      name: `${render.id}-${String(slide.index + 1).padStart(2, "0")}.${extension}`,
      mime: slide.mime,
      bytes: blob.bytes,
    })
    tokens.push(uploaded.token)
  }

  // A schedule time that passed while we were retrying means "now".
  const publishAt = post.publishAt && Date.parse(post.publishAt) > now().getTime() ? post.publishAt : null
  const { posts: created } = await publisher.createPost({
    accounts: [post.accountId],
    caption: post.caption,
    media: tokens,
    publishAt,
    platformOptions: { [post.provider]: post.platformOptions },
    postbackUrl: postbackUrl(workspaceId, post.id, env),
  })
  const remote = created.find((item) => item.accountId === post.accountId) ?? created[0]
  if (!remote?.id) {
    // Accepted without a post object (should not happen); sync later by status.
    throw new PublishingInputError("SocialBu accepted the post but returned no post id.", 409)
  }

  let updated = await repos.posts.update(workspaceId, post.id, {
    providerPostId: remote.id,
    status: remotePostStatus(remote.status, publishAt ? "scheduled" : "publishing"),
    error: null,
    ...(remote.permalink ? { permalink: remote.permalink } : {}),
    ...(remote.publishedAt ? { publishedAt: remote.publishedAt } : {}),
  })
  updated = await afterStatusChange(workspaceId, post, updated, resolved)
  if (updated.status === "scheduled" || updated.status === "publishing") {
    const syncAt = publishAt
      ? new Date(Date.parse(publishAt) + FIRST_SYNC_DELAY_MS)
      : new Date(now().getTime() + FIRST_SYNC_DELAY_MS)
    await enqueuePublishJob(workspaceId, post.id, syncAt, resolved)
  }
  if (updated.status === "scheduled") await schedulePostReminders(workspaceId, updated, { repos, now })
  return updated
}

function remotePostStatus(status: PublisherPostStatus, fallback: PostStatus): PostStatus {
  if (status === "unknown") return fallback
  return status
}

async function markFailed(workspaceId: WorkspaceId, postId: string, error: string, deps: Resolved): Promise<Post> {
  const before = await deps.repos.posts.get(workspaceId, postId)
  const updated = await deps.repos.posts.update(workspaceId, postId, { status: "failed", error })
  return before ? afterStatusChange(workspaceId, before, updated, deps) : updated
}

/** Notifications + reminder cleanup when a post reaches a final state. */
async function afterStatusChange(workspaceId: WorkspaceId, before: Post, after: Post, deps: Resolved): Promise<Post> {
  if (before.status === after.status) return after
  if (after.status === "published" || after.status === "failed" || after.status === "canceled") {
    await deps.repos.notifications.cancelForPost(workspaceId, after.id)
  }
  if (after.status === "published" || after.status === "failed") {
    await notifyPostOutcome(workspaceId, after, { repos: deps.repos, now: deps.now })
  }
  return after
}

export async function enqueuePublishJob(
  workspaceId: WorkspaceId,
  postId: string,
  runAt: Date,
  deps: PublishingDeps = {}
): Promise<Job<"publish-post">> {
  const { repos } = resolve(deps)
  const at = runAt.toISOString()
  const { value } = await repos.jobs.enqueue({
    workspaceId,
    type: "publish-post",
    payload: { postId },
    runAt: at,
    dedupeKey: `publish-post:${postId}:${at}`,
  })
  return value
}

// ─────────────────────────────── status sync ───────────────────────────────

/** Re-reads the post from SocialBu and stores its status. */
export async function refreshPostStatus(
  workspaceId: WorkspaceId,
  postId: string,
  deps: PublishingDeps = {}
): Promise<Post> {
  const resolved = resolve(deps)
  const { repos, publisher } = resolved
  const post = await repos.posts.get(workspaceId, postId)
  if (!post) throw new PublishingInputError("Post not found.", 404)
  if (!post.providerPostId || post.status === "canceled") return post
  assertPublisher(publisher)
  const remote = await publisher.getPost(post.providerPostId)
  return applyRemotePost(workspaceId, post, remote, resolved)
}

async function applyRemotePost(
  workspaceId: WorkspaceId,
  post: Post,
  remote: PublisherPost,
  deps: Resolved
): Promise<Post> {
  const status = remotePostStatus(remote.status, post.status)
  const updated = await deps.repos.posts.update(workspaceId, post.id, {
    status,
    publishAt: remote.publishAt ?? post.publishAt,
    publishedAt: remote.publishedAt ?? post.publishedAt,
    permalink: remote.permalink ?? post.permalink,
    error: status === "failed" ? (remote.error ?? post.error) : null,
  })
  return afterStatusChange(workspaceId, post, updated, deps)
}

/** `publish-post` job: submit if not yet accepted, otherwise sync status. */
export async function runPublishPostJob(
  job: Pick<Job<"publish-post">, "workspaceId" | "payload">,
  deps: PublishingDeps = {}
): Promise<{ postId: string; status: PostStatus | "missing"; next?: string }> {
  const resolved = resolve(deps)
  const { repos, now } = resolved
  const workspaceId = job.workspaceId
  const postId = job.payload.postId
  if (!workspaceId) return { postId, status: "missing" }
  const post = await repos.posts.get(workspaceId, postId)
  if (!post) return { postId, status: "missing" }
  if (post.status === "canceled" || post.status === "published" || post.status === "draft") {
    return { postId, status: post.status }
  }
  if (post.status === "failed" && !post.providerPostId) return { postId, status: post.status }

  if (!post.providerPostId) {
    try {
      const submitted = await submitPost(workspaceId, postId, resolved)
      return { postId, status: submitted.status }
    } catch (error) {
      if (isRetryableSocialBuError(error) || error instanceof PublisherNotConfiguredError) {
        await repos.posts.update(workspaceId, postId, {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      const failed = await markFailed(
        workspaceId,
        postId,
        error instanceof Error ? error.message : String(error),
        resolved
      )
      return { postId, status: failed.status }
    }
  }

  const refreshed = await refreshPostStatus(workspaceId, postId, resolved)
  if (refreshed.status !== "scheduled" && refreshed.status !== "publishing") {
    return { postId, status: refreshed.status }
  }
  const dueMs = Date.parse(refreshed.publishAt ?? refreshed.createdAt)
  const nowMs = now().getTime()
  if (nowMs > dueMs + STATUS_SYNC_WINDOW_MS) {
    await repos.posts.update(workspaceId, postId, {
      error: "SocialBu has not confirmed this post. Refresh its status to check again.",
    })
    return { postId, status: refreshed.status }
  }
  const next = new Date(Math.max(nowMs + SYNC_INTERVAL_MS, dueMs + FIRST_SYNC_DELAY_MS))
  await enqueuePublishJob(workspaceId, postId, next, resolved)
  return { postId, status: refreshed.status, next: next.toISOString() }
}

// ─────────────────────────────── edit / cancel / retry ───────────────────────────────

export async function cancelPost(workspaceId: WorkspaceId, postId: string, deps: PublishingDeps = {}): Promise<Post> {
  const resolved = resolve(deps)
  const { repos, publisher } = resolved
  const post = await repos.posts.get(workspaceId, postId)
  if (!post) throw new PublishingInputError("Post not found.", 404)
  if (post.status === "canceled") return post
  if (post.status === "published" || post.status === "publishing") {
    throw new PublishingInputError("This post is already publishing and cannot be canceled.", 409)
  }
  if (post.providerPostId && post.status !== "failed") {
    assertPublisher(publisher)
    if (!publisher.deletePost) throw new PublishingInputError("This publisher cannot cancel posts.", 409)
    await publisher.deletePost(post.providerPostId)
  }
  const canceled = await repos.posts.cancel(workspaceId, postId)
  await repos.notifications.cancelForPost(workspaceId, postId)
  return canceled
}

export async function reschedulePost(
  workspaceId: WorkspaceId,
  postId: string,
  publishAtInput: string,
  deps: PublishingDeps = {}
): Promise<Post> {
  const resolved = resolve(deps)
  const { repos, publisher, now } = resolved
  const post = await repos.posts.get(workspaceId, postId)
  if (!post) throw new PublishingInputError("Post not found.", 404)
  if (post.status !== "scheduled") throw new PublishingInputError("Only scheduled posts can be rescheduled.", 409)
  const publishAt = normalizePublishAt(publishAtInput, now())
  if (!publishAt) throw new PublishingInputError("Choose a future publish time.")

  if (post.providerPostId) {
    assertPublisher(publisher)
    if (!publisher.reschedulePost) throw new PublishingInputError("This publisher cannot reschedule posts.", 409)
    await publisher.reschedulePost(post.providerPostId, publishAt)
  }
  await repos.notifications.cancelForPost(workspaceId, postId)
  const updated = await repos.posts.update(workspaceId, postId, { publishAt, error: null })
  await enqueuePublishJob(workspaceId, postId, new Date(Date.parse(publishAt) + FIRST_SYNC_DELAY_MS), resolved)
  await schedulePostReminders(workspaceId, updated, { repos, now })
  return updated
}

/** Resubmits a failed post as a new SocialBu post. */
export async function retryPost(workspaceId: WorkspaceId, postId: string, deps: PublishingDeps = {}): Promise<Post> {
  const resolved = resolve(deps)
  const { repos, publisher, now } = resolved
  assertPublisher(publisher)
  const post = await repos.posts.get(workspaceId, postId)
  if (!post) throw new PublishingInputError("Post not found.", 404)
  if (post.status !== "failed") throw new PublishingInputError("Only failed posts can be retried.", 409)
  const future = post.publishAt && Date.parse(post.publishAt) > now().getTime()
  const reset = await repos.posts.update(workspaceId, postId, {
    status: future ? "scheduled" : "publishing",
    providerPostId: null,
    error: null,
  })
  return submitPostSafely(workspaceId, reset, resolved)
}

export async function listRenderPosts(
  workspaceId: WorkspaceId,
  renderId: string,
  deps: PublishingDeps = {}
): Promise<Post[]> {
  return resolve(deps).repos.posts.listByRender(workspaceId, renderId)
}

export type PostView = Post & {
  renderTitle: string | null
  accountName: string | null
  coverUrl: string | null
}

/** Posts in `[from, to)` joined with render titles/covers and account names (calendar). */
export async function listPostsInRange(
  workspaceId: WorkspaceId,
  range: { from: string; to: string },
  deps: PublishingDeps = {}
): Promise<PostView[]> {
  const { repos, publisher } = resolve(deps)
  const posts = await repos.posts.listRange(workspaceId, range)
  const renders = new Map<string, Render | null>()
  await Promise.all(
    [...new Set(posts.map((post) => post.renderId))].map(async (id) => {
      renders.set(id, await repos.renders.get(workspaceId, id))
    })
  )
  const accountNames = new Map<string, string>()
  if (posts.length && publisher.configured) {
    const accounts = await publisher.listAccounts().catch(() => [] as PublisherAccount[])
    for (const account of accounts) accountNames.set(account.id, account.name)
  }
  return posts.map((post) => {
    const render = renders.get(post.renderId) ?? null
    const cover = render?.output?.coverFileId
    return {
      ...post,
      renderTitle: render?.title ?? null,
      accountName: accountNames.get(post.accountId) ?? null,
      coverUrl: cover ? `/api/files/renders/${encodeURIComponent(cover)}` : null,
    }
  })
}

export async function getPost(workspaceId: WorkspaceId, postId: string, deps: PublishingDeps = {}): Promise<Post> {
  const post = await resolve(deps).repos.posts.get(workspaceId, postId)
  if (!post) throw new PublishingInputError("Post not found.", 404)
  return post
}
