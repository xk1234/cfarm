import { NextResponse } from "next/server"

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
    const response = await fetch(remoteUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.5",
        "User-Agent": "Mozilla/5.0 RealFarm image proxy",
      },
    })

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
