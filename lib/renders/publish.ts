/**
 * Publishing a succeeded render through the Publisher contract (SocialBu).
 *
 * SocialBu schedules natively (`publish_at`), so scheduling uploads the slides
 * now and creates one SocialBu post per account with the requested time. Each
 * (render, account, intent) is recorded once in the `posts` table; a retried
 * request with the same idempotency key never creates a second SocialBu post.
 */
import { z } from "zod"

import { sha256Hex, type Post, type Repositories, type WorkspaceId } from "@/lib/data"
import {
  PublisherNotConfiguredError,
  type Publisher,
  type PublisherAccount,
  type PublisherPost,
} from "@/lib/publishing/publisher"

import { slideFilename } from "./service"

export class PublishRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "PublishRequestError"
    this.status = status
  }
}

export const SchedulePostRequestSchema = z.strictObject({
  renderId: z.string().min(1),
  accountIds: z.array(z.string().min(1)).min(1).max(20),
  caption: z.string().max(5000).default(""),
  /** ISO 8601; omitted = publish now. */
  publishAt: z.iso.datetime({ offset: true }).nullish(),
  /** SocialBu `options` per provider, e.g. `{ "tiktok": { "privacy_status": "PUBLIC_TO_EVERYONE" } }`. */
  platformOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  draft: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
})
export type SchedulePostRequest = z.input<typeof SchedulePostRequestSchema>

export type SchedulePostResult = { posts: Post[] }

function mapStatus(status: PublisherPost["status"], fallback: Post["status"]): Post["status"] {
  switch (status) {
    case "draft":
    case "scheduled":
    case "publishing":
    case "published":
    case "failed":
      return status
    default:
      return fallback
  }
}

/** Accounts the publish dialog may use (hidden accounts from settings excluded). */
export async function listPublishableAccounts(
  repos: Repositories,
  publisher: Publisher,
  workspaceId: WorkspaceId
): Promise<PublisherAccount[]> {
  if (!publisher.configured) throw new PublisherNotConfiguredError()
  const [accounts, settings] = await Promise.all([publisher.listAccounts(), repos.settings.get(workspaceId)])
  const hidden = new Set(settings.disabledAccountIds)
  return accounts.filter((a) => !hidden.has(a.id))
}

export async function scheduleRenderPost(
  repos: Repositories,
  publisher: Publisher,
  workspaceId: WorkspaceId,
  input: unknown,
  context: { createdBy: string; now?: () => Date }
): Promise<SchedulePostResult> {
  const parsed = SchedulePostRequestSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new PublishRequestError(422, `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid request"}`)
  }
  const request = parsed.data
  if (!publisher.configured) throw new PublisherNotConfiguredError()

  const now = context.now?.() ?? new Date()
  const publishAt = request.publishAt ? new Date(request.publishAt) : null
  if (publishAt && publishAt.getTime() < now.getTime() - 60_000) {
    throw new PublishRequestError(422, "publishAt must be in the future.")
  }

  const render = await repos.renders.get(workspaceId, request.renderId)
  if (!render) throw new PublishRequestError(404, "Render not found.")
  if (render.status !== "succeeded" || !render.output?.slides.length) {
    throw new PublishRequestError(409, "Only a succeeded render can be published.")
  }

  const accounts = await listPublishableAccounts(repos, publisher, workspaceId)
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const unknown = request.accountIds.filter((id) => !byId.has(id))
  if (unknown.length) throw new PublishRequestError(422, `Unknown or hidden account(s): ${unknown.join(", ")}`)

  const intentBase =
    request.idempotencyKey ??
    sha256Hex(`${render.id}:${request.publishAt ?? "now"}:${request.caption}`).slice(0, 32)
  const pending: Post[] = []
  const done: Post[] = []
  for (const accountId of [...new Set(request.accountIds)]) {
    const account = byId.get(accountId)!
    const { value } = await repos.posts.upsertIntent(workspaceId, {
      renderId: render.id,
      provider: account.provider,
      accountId,
      status: request.draft ? "draft" : publishAt ? "scheduled" : "publishing",
      publishAt: (publishAt ?? now).toISOString(),
      caption: request.caption,
      platformOptions: request.platformOptions?.[account.provider] ?? {},
      intentKey: `${intentBase}:${accountId}`,
      createdBy: context.createdBy,
    })
    if (value.providerPostId || value.status === "canceled") done.push(value)
    else pending.push(value)
  }
  if (pending.length === 0) return { posts: done }

  try {
    const tokens: string[] = []
    for (const slide of render.output.slides) {
      const blob = await repos.blobs.get(workspaceId, "renders", slide.fileId)
      if (!blob) throw new PublishRequestError(409, `Slide ${slide.index + 1} of the render is missing.`)
      const uploaded = await publisher.uploadMedia({
        name: slideFilename(render, slide),
        mime: slide.mime,
        bytes: blob.bytes,
      })
      tokens.push(uploaded.token)
    }
    const created = await publisher.createPost({
      accounts: pending.map((p) => p.accountId),
      caption: request.caption,
      media: tokens,
      publishAt: publishAt ? publishAt.toISOString() : null,
      draft: request.draft,
      platformOptions: request.platformOptions,
    })
    const updated: Post[] = []
    for (const post of pending) {
      const remote = created.posts.find((p) => p.accountId === post.accountId)
      updated.push(
        await repos.posts.update(workspaceId, post.id, {
          providerPostId: remote?.id ?? null,
          status: remote ? mapStatus(remote.status, post.status) : "failed",
          publishedAt: remote?.publishedAt ?? null,
          permalink: remote?.permalink ?? null,
          error: remote ? remote.error : "SocialBu did not return a post for this account.",
        })
      )
    }
    await scheduleReminders(repos, workspaceId, updated, now)
    return { posts: [...done, ...updated] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing failed"
    for (const post of pending) {
      await repos.posts.update(workspaceId, post.id, { status: "failed", error: message }).catch(() => undefined)
    }
    throw error
  }
}

async function scheduleReminders(repos: Repositories, workspaceId: WorkspaceId, posts: Post[], now: Date) {
  const settings = await repos.settings.get(workspaceId)
  if (!settings.reminders.enabled) return
  for (const post of posts) {
    if (post.status !== "scheduled" || !post.publishAt) continue
    for (const lead of settings.reminders.leadMinutes) {
      const deliverAt = new Date(new Date(post.publishAt).getTime() - lead * 60_000)
      if (deliverAt.getTime() <= now.getTime()) continue
      await repos.notifications.schedule(workspaceId, {
        event: "post.upcoming",
        postId: post.id,
        renderId: post.renderId,
        title: `Post going out in ${lead} min`,
        body: post.caption.slice(0, 140) || null,
        deliverAt: deliverAt.toISOString(),
        dedupeKey: `post:${post.id}:upcoming:${lead}`,
      })
    }
  }
}

/** Public view of a post. */
export function postView(post: Post) {
  return {
    id: post.id,
    renderId: post.renderId,
    provider: post.provider,
    accountId: post.accountId,
    status: post.status,
    publishAt: post.publishAt,
    publishedAt: post.publishedAt,
    caption: post.caption,
    platformOptions: post.platformOptions,
    providerPostId: post.providerPostId,
    permalink: post.permalink,
    error: post.error,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}
