import {
  createPostFastPostPayload,
  postfastRequest,
  type PostFastCreatePostType,
  type PostFastMedia,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { defaultPostFastProviderControls } from "@/lib/postfast-provider-controls"
import { enqueueReminder } from "@/lib/reminders"
import {
  upsertPostFastPostRecord,
  type PostFastPostRecord,
  type PostFastPostStatus,
  type PostFastSourceType,
} from "@/lib/postfast-posts"

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
  rootDir?: string
  request?: PublishRequest
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

export function postFastPostIds(value: unknown): string[] {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return Array.isArray(record.postIds)
    ? record.postIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : []
}

export async function publishPost(
  input: PublishPostInput
): Promise<PublishPostResult> {
  const request = input.request ?? (postfastRequest as PublishRequest)
  const type = input.type ?? "now"
  const controls =
    input.controls ??
    defaultPostFastProviderControls(input.provider, input.settings ?? {})
  const payload = createPostFastPostPayload({
    type,
    date: input.date,
    integrationId: input.integrationId,
    provider: input.provider,
    content: input.content,
    media: input.media,
    controls,
  })

  try {
    const postfastPosts = await request<unknown>("/social-posts", {
      body: payload,
    })
    const postIds = postFastPostIds(postfastPosts)
    const record = await upsertPostFastPostRecord({
      rootDir: input.rootDir,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postfastPostId: postIds[0],
      integrationId: input.integrationId,
      provider: input.provider,
      status: statusForType(type),
      scheduledAt: type === "schedule" ? input.date : undefined,
      content: input.content,
      media: input.media ?? [],
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
    }
    return { ok: true, record, postfastPosts }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PostFast post creation failed"
    const record = await upsertPostFastPostRecord({
      rootDir: input.rootDir,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      integrationId: input.integrationId,
      provider: input.provider,
      status: "failed",
      content: input.content,
      media: input.media ?? [],
      error: message,
    })
    return { ok: false, record, error: message, rawError: error }
  }
}

export type PublishAutomationRunInput = {
  runId: string
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
  const request = input.request ?? (postfastRequest as PublishRequest)
  const timestamp = Date.parse(input.scheduledFor)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new Error("Choose a future time for the post")
  }
  if (!input.record.postfastPostId) {
    return upsertPostFastPostRecord({
      ...input.record,
      status: input.record.status,
      scheduledAt: new Date(timestamp).toISOString(),
    })
  }

  const payload = createPostFastPostPayload({
    type: "schedule",
    date: new Date(timestamp).toISOString(),
    integrationId: input.record.integrationId,
    provider: input.record.provider,
    content: input.record.content,
    media: input.record.media,
    controls: defaultPostFastProviderControls(input.record.provider, {}),
  })
  const created = await request<unknown>("/social-posts", { body: payload })
  const replacementId = postFastPostIds(created)[0]
  if (!replacementId) {
    throw new Error("PostFast did not return the replacement post id")
  }
  await request(
    `/social-posts/${encodeURIComponent(input.record.postfastPostId)}`,
    {
      method: "DELETE",
    }
  )
  return upsertPostFastPostRecord({
    ...input.record,
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
      upsertPostFastPostRecord({
        rootDir: input.postfastRootDir,
        sourceType: "automation",
        sourceId: input.runId,
        integrationId: integration.integration_id,
        provider: integration.provider,
        status: "awaiting_manual_post",
        scheduledAt: input.scheduledFor,
        content: input.content,
        media: input.media ?? [],
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
      upsertPostFastPostRecord({
        rootDir: input.postfastRootDir,
        sourceType: "automation",
        sourceId: input.runId,
        integrationId: integration.integration_id,
        provider: integration.provider,
        status: "ready_for_review",
        scheduledAt: input.scheduledFor,
        content: input.content,
        media: input.media ?? [],
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
      upsertPostFastPostRecord({
        rootDir: input.postfastRootDir,
        sourceType: "automation",
        sourceId: input.runId,
        integrationId: integration.integration_id,
        provider: integration.provider,
        status: "failed",
        scheduledAt: input.scheduledFor,
        content: input.content,
        media: input.media ?? [],
        error: input.error,
      })
    )
  )
  return { published: 0, failed: records.length, records }
}
