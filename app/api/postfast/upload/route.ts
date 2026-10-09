import { NextResponse } from "next/server"

import { postfastRequest, type PostFastMediaType } from "@/lib/postfast-client"
import { postfastRouteError } from "@/lib/postfast-route"
import { assertPublicHttpUrl } from "@/lib/url-guard"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? ""

  try {
    let file: File | null = null
    let sourceUrl = ""
    if (contentType.includes("application/json")) {
      const payload = await request.json().catch(() => null)
      sourceUrl = typeof payload?.url === "string" ? payload.url.trim() : ""
      if (!sourceUrl) {
        return NextResponse.json({ error: "A url is required" }, { status: 400 })
      }
    } else {
      const formData = await request.formData()
      const formFile = formData.get("file")
      if (!(formFile instanceof File)) {
        return NextResponse.json({ error: "A file is required" }, { status: 400 })
      }
      file = formFile
    }

    const source = file
      ? { bytes: await file.arrayBuffer(), contentType: file.type }
      : await fetchSource(sourceUrl, request.url).catch((error) => {
          if (error instanceof SourceUrlError) {
            return error
          }
          throw error
        })
    if (source instanceof SourceUrlError) {
      return NextResponse.json({ error: source.message }, { status: 400 })
    }

    const uploadContentType =
      source.contentType || contentTypeFromUrl(sourceUrl) || "application/octet-stream"
    const mediaType = postFastMediaType(uploadContentType)
    if (!mediaType) {
      return NextResponse.json(
        { error: `Unsupported media type: ${uploadContentType}` },
        { status: 400 }
      )
    }

    const signedUploads = await postfastRequest<unknown[]>(
      "/file/get-signed-upload-urls",
      {
        body: {
          contentType: uploadContentType,
          count: 1,
        },
      }
    )
    const signedUpload = firstSignedUpload(signedUploads)
    if (!signedUpload) {
      return NextResponse.json(
        { error: "PostFast did not return a signed upload URL" },
        { status: 502 }
      )
    }

    const uploadResponse = await fetch(signedUpload.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": uploadContentType },
      body: source.bytes,
    })
    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: "Failed to upload media to PostFast storage" },
        { status: 502 }
      )
    }

    const upload = {
      key: signedUpload.key,
      type: mediaType,
      sortOrder: 0,
    }

    return NextResponse.json({ upload })
  } catch (error) {
    return postfastRouteError(error)
  }
}

async function fetchSource(url: string, requestUrl: string) {
  const resolvedUrl = await absoluteSourceUrl(url, requestUrl)
  const response = await fetchPublicSource(resolvedUrl)
  if (!response.ok) {
    throw new Error("Failed to fetch media source")
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type")?.split(";")[0]?.trim() ?? "",
  }
}

async function fetchPublicSource(url: string, redirectCount = 0): Promise<Response> {
  const response = await fetch(url, { redirect: "manual" })
  if (!isRedirect(response.status)) {
    return response
  }

  if (redirectCount >= 3) {
    throw new SourceUrlError("Too many media source redirects")
  }

  const location = response.headers.get("location")
  if (!location) {
    throw new SourceUrlError("Media source redirect did not include a location")
  }

  const nextUrl = new URL(location, url).toString()
  await assertPublicHttpUrl(nextUrl)
  return fetchPublicSource(nextUrl, redirectCount + 1)
}

async function absoluteSourceUrl(url: string, requestUrl: string) {
  if (url.startsWith("/api/local-assets/")) {
    return new URL(url, requestUrl).toString()
  }
  if (url.startsWith("/")) {
    throw new SourceUrlError("Only /api/local-assets/ relative URLs are supported")
  }

  try {
    const parsedUrl = await assertPublicHttpUrl(url)
    return parsedUrl.toString()
  } catch {
    throw new SourceUrlError("A public http or https media source URL is required")
  }
}

function isRedirect(status: number) {
  return status >= 300 && status < 400
}

function contentTypeFromUrl(url: string) {
  const extension = url.split("?")[0]?.split(".").pop()?.toLowerCase()
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "gif":
      return "image/gif"
    case "webp":
      return "image/webp"
    case "mp4":
      return "video/mp4"
    case "webm":
      return "video/webm"
    case "mov":
      return "video/quicktime"
    default:
      return ""
  }
}

function postFastMediaType(contentType: string): PostFastMediaType | null {
  if (contentType.startsWith("image/")) {
    return "IMAGE"
  }
  if (contentType.startsWith("video/")) {
    return "VIDEO"
  }
  return null
}

function firstSignedUpload(value: unknown) {
  const first = Array.isArray(value) ? value[0] : null
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null
  }
  const record = first as Record<string, unknown>
  const key = typeof record.key === "string" ? record.key : ""
  const signedUrl =
    typeof record.signedUrl === "string" ? record.signedUrl : ""
  return key && signedUrl ? { key, signedUrl } : null
}

class SourceUrlError extends Error {}
