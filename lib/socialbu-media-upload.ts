import { clean, isRecord } from "@/lib/guards"
import type { PostFastMedia, PostFastMediaType } from "@/lib/postfast-client"
import { socialbuRequest } from "@/lib/socialbu-client"

/**
 * Uploads raw bytes to SocialBu using the three-step signed flow and returns a
 * neutral media descriptor whose `key` carries the SocialBu `upload_token`, so
 * it flows through the existing media plumbing and becomes an
 * `existing_attachments` entry at post-create time.
 */
export async function uploadSocialBuBytes(input: {
  bytes: Uint8Array | Buffer
  contentType: string
  mediaType: PostFastMediaType
  fileName?: string
  sortOrder?: number
  fetcher?: typeof fetch
}): Promise<PostFastMedia> {
  const fetcher = input.fetcher ?? fetch
  const signed = await socialbuRequest<unknown>("/upload_media", {
    body: {
      name: input.fileName || `media-${Date.now()}`,
      mime_type: input.contentType,
    },
  })
  const record = isRecord(signed) ? signed : {}
  const signedUrl = clean(record.signed_url)
  const key = clean(record.key)
  if (!signedUrl || !key) {
    throw new Error("SocialBu did not return a signed upload URL")
  }

  const body = Uint8Array.from(input.bytes)
  const uploadResponse = await fetcher(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body,
    signal: AbortSignal.timeout(60_000),
  })
  if (!uploadResponse.ok) {
    throw new Error(
      `SocialBu media upload failed with ${uploadResponse.status}`
    )
  }

  const directToken = clean(record.upload_token)
  const token = directToken || (await pollUploadToken(key))
  if (!token) {
    throw new Error("SocialBu did not return an upload token")
  }
  return { key: token, type: input.mediaType, sortOrder: input.sortOrder ?? 0 }
}

async function pollUploadToken(key: string, attempts = 15): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await socialbuRequest<unknown>("/upload_media/status", {
      method: "GET",
      query: { key },
    })
    const record = isRecord(status) ? status : {}
    const token = clean(record.upload_token)
    if (record.success === true && token) {
      return token
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return ""
}

export function socialBuMediaTypeFor(
  contentType: string
): PostFastMediaType | null {
  if (contentType.startsWith("image/")) return "IMAGE"
  if (contentType.startsWith("video/")) return "VIDEO"
  return null
}
