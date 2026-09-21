import {
  createPostFastPostPayload,
  postfastRequest,
  type PostFastCreatePostType,
  type PostFastMedia,
} from "@/lib/postfast-client"
import {
  postFastPostIds as parsePostFastPostIds,
  postFastReleaseUrl,
} from "@/lib/publishing-core"
import { defaultPostFastProviderControls } from "@/lib/postfast-provider-controls"
import {
  createSocialBuPostPayload,
  socialbuRequest,
  socialBuPostIds,
  socialBuReleaseUrl,
} from "@/lib/socialbu-client"
import {
  activePublishingProvider,
  type PublishingProviderId,
} from "@/lib/social/publishing-provider"

/**
 * Injectable transport used by both providers so the publishing seam can be
 * unit-tested without hitting the network. Matches the historical
 * `PublishRequest` shape used across the posting code.
 */
export type PublishTransport = <T = unknown>(
  path: string,
  options: { body?: unknown; method?: string }
) => Promise<T>

export type PublishingCreateInput = {
  type: PostFastCreatePostType
  date?: string
  integrationId: string
  provider: string
  content: string
  media?: PostFastMedia[]
  controls?: Record<string, unknown>
  settings?: Record<string, unknown>
  request?: PublishTransport
  now?: Date
}

export type PublishingCreateResult = {
  postIds: string[]
  releaseUrl?: string
  raw: unknown
}

export interface PublishingClient {
  readonly id: PublishingProviderId
  createPost(input: PublishingCreateInput): Promise<PublishingCreateResult>
  deletePost(externalId: string, request?: PublishTransport): Promise<void>
}

export const postFastPublishingClient: PublishingClient = {
  id: "postfast",
  async createPost(input) {
    const request = input.request ?? (postfastRequest as PublishTransport)
    const controls =
      input.controls ??
      defaultPostFastProviderControls(input.provider, input.settings ?? {})
    const payload = createPostFastPostPayload({
      type: input.type,
      date: input.date,
      integrationId: input.integrationId,
      provider: input.provider,
      content: input.content,
      media: input.media,
      controls,
    })
    const raw = await request<unknown>("/social-posts", { body: payload })
    return {
      postIds: parsePostFastPostIds(raw),
      releaseUrl: postFastReleaseUrl(raw),
      raw,
    }
  },
  async deletePost(externalId, request) {
    const call = request ?? (postfastRequest as PublishTransport)
    await call(`/social-posts/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
    })
  },
}

export const socialBuPublishingClient: PublishingClient = {
  id: "socialbu",
  async createPost(input) {
    const request = input.request ?? (socialbuRequest as PublishTransport)
    const attachments = (input.media ?? [])
      .filter((item) => item.key)
      .map((item) => ({ upload_token: item.key }))
    const payload = createSocialBuPostPayload({
      type: input.type,
      date: input.date,
      accountIds: [input.integrationId],
      content: input.content,
      attachments,
      options: input.controls ?? input.settings,
      now: input.now,
    })
    const raw = await request<unknown>("/posts", { body: payload })
    return {
      postIds: socialBuPostIds(raw),
      releaseUrl: socialBuReleaseUrl(raw),
      raw,
    }
  },
  async deletePost(externalId, request) {
    const call = request ?? (socialbuRequest as PublishTransport)
    await call(`/posts/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
    })
  },
}

const clientsById: Record<PublishingProviderId, PublishingClient> = {
  postfast: postFastPublishingClient,
  socialbu: socialBuPublishingClient,
}

export function resolvePublishingClient(
  provider: PublishingProviderId = activePublishingProvider()
): PublishingClient {
  return clientsById[provider]
}
