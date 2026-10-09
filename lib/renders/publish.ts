/**
 * Public (/api/v1, MCP) request shape for publishing a succeeded render. The
 * work itself lives in lib/publishing/service.ts: SocialBu schedules natively
 * (`publish_at`), each (render, account, intent) is recorded once in the
 * `posts` table, and a retried request with the same idempotency key never
 * creates a second SocialBu post.
 */
import { z } from "zod"

import type { Post, Repositories, WorkspaceId } from "@/lib/data"
import { PublisherNotConfiguredError, type Publisher, type PublisherAccount } from "@/lib/publishing/publisher"
import { listPublishingAccounts, publishRender, PublishingInputError } from "@/lib/publishing/service"

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

/** Accounts the publish dialog may use (hidden accounts from settings excluded). */
export async function listPublishableAccounts(
  repos: Repositories,
  publisher: Publisher,
  workspaceId: WorkspaceId
): Promise<PublisherAccount[]> {
  if (!publisher.configured) throw new PublisherNotConfiguredError()
  const { accounts } = await listPublishingAccounts(workspaceId, { repos, publisher })
  return accounts.filter((a) => !a.disabled).map(({ disabled: _disabled, ...account }) => account)
}

/**
 * `/api/v1` + MCP entry point. Validates the public request shape, then hands
 * off to the publishing service (lib/publishing/service.ts), which owns
 * uploads, SocialBu post creation, idempotency, retries and reminders.
 */
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
  if (request.draft) throw new PublishRequestError(422, "draft: drafts are not supported; omit publishAt to publish now.")
  if (!publisher.configured) throw new PublisherNotConfiguredError()
  try {
    return await publishRender(
      workspaceId,
      {
        renderId: request.renderId,
        accountIds: request.accountIds,
        caption: request.caption,
        publishAt: request.publishAt ?? null,
        platformOptions: request.platformOptions,
        createdBy: context.createdBy,
        idempotencyKey: request.idempotencyKey ?? null,
      },
      { repos, publisher, now: context.now }
    )
  } catch (error) {
    if (error instanceof PublishingInputError) {
      throw new PublishRequestError(error.status === 400 ? 422 : error.status, error.message)
    }
    throw error
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
