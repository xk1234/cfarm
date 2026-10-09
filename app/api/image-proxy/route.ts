import { NextResponse } from "next/server"

import { assertPublicHttpUrl, guardedFetch } from "@/lib/url-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

    const body = await readCapped(response, maxImageBytes)
    if (!body) {
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
  // guardedFetch pins the socket to the address the SSRF policy approved.
  const response = await guardedFetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
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

/** Streams the body, stopping as soon as it exceeds `maxBytes` (null). */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
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
