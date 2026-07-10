import {
  createPostFastPostPayload,
  postfastRequest,
  type PostFastCreatePostType,
  type PostFastMedia,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { defaultPostFastProviderControls } from "@/lib/postfast-provider-controls"
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
  integrations: PostFastSocialIntegration[]
  content: string
  media?: PostFastMedia[]
  postfastRootDir?: string
  request?: PublishRequest
}

export type PublishAutomationRunResult = {
  published: number
  failed: number
  records: PostFastPostRecord[]
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

  for (const integration of integrations) {
    const result = await publishPost({
      type: "now",
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
