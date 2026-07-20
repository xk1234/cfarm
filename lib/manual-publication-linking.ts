import { clean } from "@/lib/guards"
import {
  ManualPublicationUrlError,
  parseManualPublicationUrl,
} from "@/lib/manual-publication"
import {
  listPostFastPostRecords,
  upsertPostFastPostRecord,
  type PostFastSourceType,
} from "@/lib/postfast-posts"
import type { PostFastMedia } from "@/lib/postfast-client"

export class ManualPublicationConflictError extends Error {
  readonly status = 409

  constructor(message: string) {
    super(message)
    this.name = "ManualPublicationConflictError"
  }
}

export async function linkPublishedOutput(input: {
  sourceType: PostFastSourceType
  sourceId: string
  integrationId: string
  provider: string
  releaseUrl: string
  publishedAt: string
  content: string
  media?: PostFastMedia[]
}) {
  const parsed = parseManualPublicationUrl({
    url: input.releaseUrl,
    provider: input.provider,
  })
  const records = await listPostFastPostRecords()
  const conflict = records.find(
    (item) =>
      sameProvider(item.provider, input.provider) &&
      item.externalPostId === parsed.externalPostId &&
      (item.sourceType !== input.sourceType || item.sourceId !== input.sourceId)
  )
  if (conflict) {
    throw new ManualPublicationConflictError(
      "That published post is already linked to another output"
    )
  }

  return upsertPostFastPostRecord({
    sourceType: input.sourceType,
    sourceId: clean(input.sourceId),
    integrationId: clean(input.integrationId),
    provider: clean(input.provider),
    status: "published",
    publishedAt: clean(input.publishedAt),
    releaseUrl: parsed.releaseUrl,
    externalPostId: parsed.externalPostId,
    externallyManaged: true,
    content: clean(input.content),
    media: input.media ?? [],
  })
}

export function manualPublicationErrorStatus(error: unknown) {
  if (
    error instanceof ManualPublicationUrlError ||
    error instanceof ManualPublicationConflictError
  ) {
    return error.status
  }
  return null
}

export function samePublicationProvider(left: string, right: string) {
  return sameProvider(left, right)
}

function sameProvider(left: string, right: string) {
  const normalize = (value: string) => {
    const provider = clean(value).toLowerCase()
    if (provider === "twitter") return "x"
    return provider.startsWith("tiktok") ? "tiktok" : provider
  }
  return normalize(left) === normalize(right)
}
