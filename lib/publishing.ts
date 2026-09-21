import {
  type PostFastCreatePostType,
  type PostFastMedia,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { resolvePublishingClient } from "@/lib/social/publishing-client"
import { getReminderSettings } from "@/lib/reminder-settings"
import { enqueueReminder } from "@/lib/reminders"
import {
  type PostFastPostRecord,
  type PostFastPostStatus,
  type PostFastSourceType,
} from "@/lib/postfast-posts"
import { upsertPublicationPost } from "@/lib/post-writer"
import type { PostOrigin } from "@/lib/posts"

export {
  effectivePostingMode,
  postFastPostIds,
  postFastReleaseUrl,
  postFastSchedulePayload,
} from "@/lib/publishing-core"

// A8.1 — shared publishing seam.
//
// Both the manual `POST /api/postfast/posts` route and the automation runner
// publish through `publishPost` so the create-post payload, PostFast call, and
// success/failure record-keeping live in exactly one place. `request` is
// injectable so the automation cron path can be unit-tested without hitting the
// network (default = the real `postfastRequest`).

export type PublishRequest = <T = unknown>(
  path: string,
  options: { body?: unknown; method?: string }
) => Promise<T>

export type PublishPostInput = {
  type?: PostFastCreatePostType
  date?: string
  integrationId: string
  provider: string
  content: string
  media?: PostFastMedia[]
  controls?: Record<string, unknown>
  settings?: Record<string, unknown>
  sourceType: PostFastSourceType
  sourceId: string
  postId?: string
  intentId?: string
  outputId?: string
  automationId?: string
  runId?: string
  sourceEntityId?: string
  origin?: PostOrigin
  rootDir?: string
  request?: PublishRequest
  now?: Date
}

export type PublishPostResult = {
  ok: boolean
  record: PostFastPostRecord
  postfastPosts?: unknown
  error?: string
  rawError?: unknown
}

export function statusForType(
  type: PostFastCreatePostType
): PostFastPostStatus {
  if (type === "schedule") {
    return "scheduled"
  }
  return type === "now" ? "published" : "draft"
}

export async function enqueuePublishedCommentReminders(input: {
  sourceType: PostFastSourceType
  sourceId: string
  content: string
  releaseUrl?: string
  publishedAt?: string
  now?: Date
}) {
  if (!input.releaseUrl) return []
  const settings = await getReminderSettings()
  const eventSettings = settings.events.respond_to_comments
  if (eventSettings.channel === "none") return []
  const publishedAt = Date.parse(input.publishedAt ?? "")
  const baseTime = Number.isFinite(publishedAt)
    ? publishedAt
    : (input.now ?? new Date()).getTime()
  const postName = input.content.split("\n")[0]?.trim() || "Published post"
  return Promise.all(
    (eventSettings.offsetsHours ?? []).map((offsetHours) =>
      enqueueReminder({
        event: "respond_to_comments",
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        availableAt: new Date(baseTime + offsetHours * 60 * 60 * 1000),
        dedupeSuffix: `${offsetHours}h`,
        text: ["Respond to comments", postName, input.releaseUrl].join("\n"),
      })
    )
  )
}

export async function publishPost(
  input: PublishPostInput
): Promise<PublishPostResult> {
  const type = input.type ?? "now"
  const client = resolvePublishingClient()

  try {
    const created = await client.createPost({
      type,
      date: input.date,
      integrationId: input.integrationId,
      provider: input.provider,
      content: input.content,
      media: input.media,
      controls: input.controls,
      settings: input.settings,
      request: input.request,
      now: input.now,
    })
    const postfastPosts = created.raw
    const postIds = created.postIds
    const releaseUrl = created.releaseUrl
    const record = await upsertPublicationPost({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postfastPostId: postIds[0],
      integrationId: input.integrationId,
      provider: input.provider,
      linkState: "postfast_published",
      status: statusForType(type),
      releaseUrl,
      scheduledAt: type === "schedule" ? input.date : undefined,
      content: input.content,
      media: input.media ?? [],
      postId: input.postId,
      intentId: input.intentId,
      outputId: input.outputId,
      automationId: input.automationId,
      runId: input.runId,
      sourceEntityId: input.sourceEntityId,
      origin: input.origin,
    })
    if (type === "schedule") {
      await enqueueReminder({
        event: "scheduled_to_post",
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        scheduledFor: input.date,
        dedupeSuffix: `${input.integrationId}:${input.date ?? "now"}`,
        text: [
          "Post scheduled",
          input.content,
          input.date ? `Scheduled for ${input.date}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => undefined)
    } else if (type === "now") {
      await enqueuePublishedCommentReminders({
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        content: record.content,
        releaseUrl: record.releaseUrl,
        publishedAt: record.publishedAt,
        now: input.now,
      }).catch(() => undefined)
    }
    return { ok: true, record, postfastPosts }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Post creation failed"
    const record = await upsertPublicationPost({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      integrationId: input.integrationId,
      provider: input.provider,
      linkState: "postfast_published",
      status: "failed",
      content: input.content,
      media: input.media ?? [],
      error: message,
      postId: input.postId,
      intentId: input.intentId,
      outputId: input.outputId,
      automationId: input.automationId,
      runId: input.runId,
      sourceEntityId: input.sourceEntityId,
      origin: input.origin,
    })
    return { ok: false, record, error: message, rawError: error }
  }
}

export type PublishAutomationRunInput = {
  runId: string
  outputId?: string
  automationId?: string
  scheduledFor: string
  integrations: PostFastSocialIntegration[]
  content: string
  media?: PostFastMedia[]
  postfastRootDir?: string
  request?: PublishRequest
  now?: Date
}

export type PublishAutomationRunResult = {
  published: number
  failed: number
  records: PostFastPostRecord[]
}

export async function reschedulePost(input: {
  record: PostFastPostRecord
  scheduledFor: string
  request?: PublishRequest
}) {
  const client = resolvePublishingClient()
  const timestamp = Date.parse(input.scheduledFor)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new Error("Choose a future time for the post")
  }
  if (!input.record.postfastPostId) {
    return upsertPublicationPost({
      ...input.record,
      postId: input.record.id,
      status: input.record.status,
      scheduledAt: new Date(timestamp).toISOString(),
    })
  }

  const created = await client.createPost({
    type: "schedule",
    date: new Date(timestamp).toISOString(),
    integrationId: input.record.integrationId,
    provider: input.record.provider,
    content: input.record.content,
    media: input.record.media,
    request: input.request,
  })
  const replacementId = created.postIds[0]
  if (!replacementId) {
    throw new Error("The provider did not return the replacement post id")
  }
  await client.deletePost(input.record.postfastPostId, input.request)
  return upsertPublicationPost({
    ...input.record,
    postId: input.record.id,
    postfastPostId: replacementId,
    status: "scheduled",
    scheduledAt: new Date(timestamp).toISOString(),
    error: undefined,
  })
}

// Publish one automation run to every active integration. Called by the cron
// runner when `auto_post` is enabled. Uses sourceType "automation" + runId so
// `socialStatusesForRun` reflects the resulting records on the run.
export async function publishAutomationRun(
  input: PublishAutomationRunInput
): Promise<PublishAutomationRunResult> {
  const integrations = input.integrations.filter(
    (integration) => integration.integration_id && !integration.disabled
  )
  const records: PostFastPostRecord[] = []
  let published = 0
  let failed = 0
  const scheduledTime = Date.parse(input.scheduledFor)
  const scheduleForFuture =
    Number.isFinite(scheduledTime) &&
    scheduledTime > (input.now ?? new Date()).getTime()

  for (const integration of integrations) {
    const result = await publishPost({
      type: scheduleForFuture ? "schedule" : "now",
      date: scheduleForFuture ? input.scheduledFor : undefined,
      integrationId: integration.integration_id,
      provider: integration.provider,
      content: input.content,
      media: input.media,
      sourceType: "automation",
      sourceId: input.runId,
      outputId: input.outputId,
      automationId: input.automationId,
      runId: input.runId,
      rootDir: input.postfastRootDir,
      request: input.request,
    })
    records.push(result.record)
    if (result.ok) {
      published += 1
    } else {
      failed += 1
    }
  }

  return { published, failed, records }
}

export async function recordAwaitingManualAutomationRun(
  input: PublishAutomationRunInput
): Promise<PublishAutomationRunResult> {
  const integrations = input.integrations.filter(
    (integration) => integration.integration_id && !integration.disabled
  )
  const records = await Promise.all(
    integrations.map((integration) =>
      upsertPublicationPost({
        sourceType: "automation",
        sourceId: input.runId,
        integrationId: integration.integration_id,
        provider: integration.provider,
        status: "awaiting_manual_post",
        scheduledAt: input.scheduledFor,
        content: input.content,
        media: input.media ?? [],
        outputId: input.outputId,
        automationId: input.automationId,
        runId: input.runId,
        origin: "automation_generation",
      })
    )
  )
  return { published: 0, failed: 0, records }
}

export async function recordReadyForReviewAutomationRun(
  input: PublishAutomationRunInput
): Promise<PublishAutomationRunResult> {
  const integrations = input.integrations.filter(
    (integration) => integration.integration_id && !integration.disabled
  )
  const records = await Promise.all(
    integrations.map((integration) =>
      upsertPublicationPost({
        sourceType: "automation",
        sourceId: input.runId,
        integrationId: integration.integration_id,
        provider: integration.provider,
        status: "ready_for_review",
        scheduledAt: input.scheduledFor,
        content: input.content,
        media: input.media ?? [],
        outputId: input.outputId,
        automationId: input.automationId,
        runId: input.runId,
        origin: "automation_generation",
      })
    )
  )
  return { published: 0, failed: 0, records }
}

export async function recordFailedAutomationRun(
  input: PublishAutomationRunInput & { error: string }
): Promise<PublishAutomationRunResult> {
  const integrations = input.integrations.filter(
    (integration) => integration.integration_id && !integration.disabled
  )
  const records = await Promise.all(
    integrations.map((integration) =>
      upsertPublicationPost({
        sourceType: "automation",
        sourceId: input.runId,
        integrationId: integration.integration_id,
        provider: integration.provider,
        status: "failed",
        scheduledAt: input.scheduledFor,
        content: input.content,
        media: input.media ?? [],
        error: input.error,
        outputId: input.outputId,
        automationId: input.automationId,
        runId: input.runId,
        origin: "automation_generation",
      })
    )
  )
  return { published: 0, failed: records.length, records }
}
