import "server-only"

import {
  APPWRITE_API_KEY,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  appwriteEnabled,
} from "@/lib/appwrite"

type AppwriteFileResponseInput = {
  bucketId: string
  fileId: string
  contentType: string
  range?: string | null
}

const forwardedHeaders = [
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
] as const

export async function appwriteFileResponse(
  input: AppwriteFileResponseInput
): Promise<Response> {
  if (!appwriteEnabled()) {
    return Response.json(
      { error: "Appwrite Storage is not configured" },
      { status: 503 }
    )
  }

  const endpoint = APPWRITE_ENDPOINT.replace(/\/$/, "")
  const url = `${endpoint}/storage/buckets/${encodeURIComponent(input.bucketId)}/files/${encodeURIComponent(input.fileId)}/view`
  const requestHeaders = new Headers({
    "X-Appwrite-Key": APPWRITE_API_KEY,
    "X-Appwrite-Project": APPWRITE_PROJECT_ID,
  })
  if (input.range) requestHeaders.set("Range", input.range)

  const upstream = await fetch(url, {
    headers: requestHeaders,
    cache: "no-store",
  })
  if (!upstream.ok) {
    return Response.json(
      {
        error:
          upstream.status === 404 ? "Asset not found" : "Asset unavailable",
      },
      { status: upstream.status }
    )
  }

  const responseHeaders = new Headers({
    "Cache-Control": "private, max-age=3600",
    "Content-Type": input.contentType,
    Vary: "Range",
  })
  for (const name of forwardedHeaders) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  if (!responseHeaders.has("Accept-Ranges")) {
    responseHeaders.set("Accept-Ranges", "bytes")
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
