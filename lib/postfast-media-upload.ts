import path from "node:path"

import { readAssetBytes } from "@/lib/asset-storage"
import {
  postfastRequest,
  type PostFastMedia,
  type PostFastMediaType,
} from "@/lib/postfast-client"

type UploadRequest = <T = unknown>(
  path: string,
  options: { body?: unknown; method?: string }
) => Promise<T>

type MediaSource = {
  bytes: Buffer
  contentType: string
  mediaType: PostFastMediaType
  index: number
}

export async function uploadPostFastMediaSources(input: {
  urls: string[]
  request?: UploadRequest
  fetcher?: typeof fetch
}): Promise<PostFastMedia[]> {
  if (input.urls.length === 0) {
    throw new Error("Rendered slideshow has no media to publish")
  }

  const request = input.request ?? (postfastRequest as UploadRequest)
  const fetcher = input.fetcher ?? fetch
  const sources = await Promise.all(
    input.urls.map((url, index) => loadMediaSource(url, index, fetcher))
  )
  const uploaded: PostFastMedia[] = []

  for (const [contentType, matching] of groupByContentType(sources)) {
    for (let offset = 0; offset < matching.length; offset += 8) {
      const batch = matching.slice(offset, offset + 8)
      const signed = normalizeSignedUploads(
        await request<unknown>("/file/get-signed-upload-urls", {
          body: { contentType, count: batch.length },
        })
      )
      if (signed.length !== batch.length) {
        throw new Error(
          `PostFast returned ${signed.length} upload URLs for ${batch.length} media files`
        )
      }

      await Promise.all(
        batch.map(async (source, index) => {
          const target = signed[index]
          const response = await fetcher(target.signedUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: Uint8Array.from(source.bytes),
          })
          if (!response.ok) {
            throw new Error(
              `PostFast media upload failed with ${response.status}`
            )
          }
          uploaded.push({
            key: target.key,
            type: source.mediaType,
            sortOrder: source.index,
          })
        })
      )
    }
  }

  return uploaded.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

async function loadMediaSource(
  rawUrl: string,
  index: number,
  fetcher: typeof fetch
): Promise<MediaSource> {
  const url = rawUrl.trim()
  const contentType = contentTypeForUrl(url)
  const mediaType = contentType.startsWith("image/")
    ? "IMAGE"
    : contentType.startsWith("video/")
      ? "VIDEO"
      : null
  if (!mediaType) throw new Error(`Unsupported PostFast media: ${url}`)

  if (url.startsWith("/api/local-assets/")) {
    const relative = decodeURIComponent(url.slice("/api/local-assets/".length))
    const dataRoot = path.join(process.cwd(), "data")
    const assetPath = path.normalize(path.join(dataRoot, relative))
    if (!assetPath.startsWith(`${dataRoot}${path.sep}`)) {
      throw new Error("Invalid local media path")
    }
    return {
      bytes: await readAssetBytes(assetPath),
      contentType,
      mediaType,
      index,
    }
  }

  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("PostFast media must use an HTTP(S) URL")
  }
  const response = await fetcher(parsed, { redirect: "follow" })
  if (!response.ok) throw new Error(`Could not load media: ${response.status}`)
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType:
      response.headers.get("content-type")?.split(";")[0] || contentType,
    mediaType,
    index,
  }
}

function groupByContentType(sources: MediaSource[]) {
  const groups = new Map<string, MediaSource[]>()
  for (const source of sources) {
    groups.set(source.contentType, [
      ...(groups.get(source.contentType) ?? []),
      source,
    ])
  }
  return groups
}

function normalizeSignedUploads(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const key = typeof record.key === "string" ? record.key : ""
    const signedUrl =
      typeof record.signedUrl === "string" ? record.signedUrl : ""
    return key && signedUrl ? [{ key, signedUrl }] : []
  })
}

function contentTypeForUrl(url: string) {
  const pathname = new URL(url, "http://local").pathname.toLowerCase()
  if (pathname.endsWith(".png")) return "image/png"
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg"))
    return "image/jpeg"
  if (pathname.endsWith(".gif")) return "image/gif"
  if (pathname.endsWith(".webp")) return "image/webp"
  if (pathname.endsWith(".mp4")) return "video/mp4"
  if (pathname.endsWith(".webm")) return "video/webm"
  if (pathname.endsWith(".mov")) return "video/quicktime"
  return "application/octet-stream"
}
