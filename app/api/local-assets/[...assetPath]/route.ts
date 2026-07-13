import path from "node:path"

import { NextResponse } from "next/server"

import { getAppwrite } from "@/lib/appwrite"
import { bucketForPath, fileIdForPath } from "@/lib/appwrite-stores"

export const dynamic = "force-dynamic"

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assetPath: string[] }> }
) {
  const { assetPath } = await context.params
  const dataRoot = path.join(process.cwd(), "data")
  const requestedPath = path.normalize(path.join(dataRoot, ...assetPath))

  if (!requestedPath.startsWith(dataRoot + path.sep)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 })
  }

  const relPath = assetPath.join("/")
  const contentType =
    contentTypes[path.extname(relPath).toLowerCase()] ??
    "application/octet-stream"

  // Serve from Appwrite Storage when configured; fall back to the filesystem.
  const appwriteResponse = await serveFromAppwrite(
    relPath,
    contentType,
    request.headers.get("range")
  )
  if (appwriteResponse) return appwriteResponse

  // Appwrite-only: no filesystem fallback. If it isn't in Storage, it's a 404.
  return NextResponse.json({ error: "Asset not found" }, { status: 404 })
}

async function serveFromAppwrite(
  relPath: string,
  contentType: string,
  rangeHeader: string | null
): Promise<NextResponse | null> {
  const aw = getAppwrite()
  if (!aw) return null
  try {
    const bucket = bucketForPath(relPath)
    const fileId = fileIdForPath(relPath)
    const view = await aw.storage.getFileView(bucket, fileId)
    const body = Buffer.from(view as ArrayBuffer)
    const size = body.byteLength
    const range = parseRangeHeader(rangeHeader, size)

    if (range) {
      const chunk = body.subarray(range.start, range.end + 1)
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Content-Type": contentType,
        },
      })
    }

    return new NextResponse(body, {
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": String(size),
        "Content-Type": contentType,
      },
    })
  } catch {
    // Not found in Appwrite (e.g. freshly generated asset) -> fall back to fs.
    return null
  }
}

function parseRangeHeader(value: string | null, size: number) {
  if (!value || size <= 0) {
    return null
  }

  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) {
    return null
  }

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) {
    return null
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null
    }
    const start = Math.max(0, size - suffixLength)
    return { start, end: size - 1 }
  }

  const start = Number(rawStart)
  const requestedEnd = rawEnd ? Number(rawEnd) : size - 1
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null
  }

  return { start, end: Math.min(requestedEnd, size - 1) }
}
