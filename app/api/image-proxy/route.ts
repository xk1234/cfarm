import { NextResponse } from "next/server"

import { assertPublicHttpUrl } from "@/lib/url-guard"

export const dynamic = "force-dynamic"

const allowedContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])
const maxImageBytes = 15 * 1024 * 1024

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawUrl = searchParams.get("url")?.trim()
  const remoteUrl = parseRemoteImageUrl(rawUrl)

  if (!remoteUrl) {
    return NextResponse.json({ error: "A valid remote image URL is required" }, { status: 400 })
  }

  try {
    await assertPublicHttpUrl(remoteUrl)
  } catch {
    return NextResponse.json({ error: "A valid remote image URL is required" }, { status: 400 })
  }

  try {
    const response = await fetchRemoteImage(remoteUrl)

    if (!response.ok) {
      return NextResponse.json({ error: "Remote image could not be loaded" }, { status: 502 })
    }

    const contentType = normalizeImageContentType(response.headers.get("content-type"))
    if (!contentType) {
      return NextResponse.json({ error: "Remote URL did not return a supported image" }, { status: 415 })
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0)
    if (contentLength > maxImageBytes) {
      return NextResponse.json({ error: "Remote image is too large" }, { status: 413 })
    }

    const body = Buffer.from(await response.arrayBuffer())
    if (body.byteLength > maxImageBytes) {
      return NextResponse.json({ error: "Remote image is too large" }, { status: 413 })
    }

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(body.byteLength),
        "Content-Type": contentType,
      },
    })
  } catch {
    return NextResponse.json({ error: "Remote image could not be loaded" }, { status: 502 })
  }
}

async function fetchRemoteImage(url: string, redirectCount = 0): Promise<Response> {
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.5",
      "User-Agent": "Mozilla/5.0 RealFarm image proxy",
    },
  })

  if (!isRedirect(response.status)) {
    return response
  }

  if (redirectCount >= 3) {
    throw new Error("Too many redirects")
  }

  const location = response.headers.get("location")
  if (!location) {
    throw new Error("Redirect did not include a location")
  }

  const nextUrl = new URL(location, url).toString()
  await assertPublicHttpUrl(nextUrl)
  return fetchRemoteImage(nextUrl, redirectCount + 1)
}

function isRedirect(status: number) {
  return status >= 300 && status < 400
}

function parseRemoteImageUrl(rawUrl?: string | null) {
  if (!rawUrl) {
    return null
  }

  try {
    const url = new URL(rawUrl)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function normalizeImageContentType(value: string | null) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase() ?? ""
  return allowedContentTypes.has(contentType) ? contentType : ""
}
