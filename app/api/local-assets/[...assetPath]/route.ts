import { readFile, stat } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".avif": "image/avif",
  ".gif": "image/gif",
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

export async function GET(request: Request, context: { params: Promise<{ assetPath: string[] }> }) {
  const { assetPath } = await context.params
  const dataRoot = path.join(process.cwd(), "data")
  const requestedPath = path.normalize(path.join(dataRoot, ...assetPath))

  if (!requestedPath.startsWith(dataRoot + path.sep)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 })
  }

  try {
    const contentType = contentTypes[path.extname(requestedPath).toLowerCase()] ?? "application/octet-stream"
    const fileStat = await stat(requestedPath)
    const range = parseRangeHeader(request.headers.get("range"), fileStat.size)

    if (range) {
      const body = await readFile(requestedPath)
      const chunk = body.subarray(range.start, range.end + 1)

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
          "Content-Type": contentType,
        },
      })
    }

    const body = await readFile(requestedPath)

    return new NextResponse(body, {
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": String(fileStat.size),
        "Content-Type": contentType,
      },
    })
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
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
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return null
  }

  return { start, end: Math.min(requestedEnd, size - 1) }
}
