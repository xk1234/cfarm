import { readFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
}

export async function GET(_request: Request, context: { params: Promise<{ assetPath: string[] }> }) {
  const { assetPath } = await context.params
  const dataRoot = path.join(process.cwd(), "data")
  const requestedPath = path.normalize(path.join(dataRoot, ...assetPath))

  if (!requestedPath.startsWith(dataRoot + path.sep)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 })
  }

  try {
    const body = await readFile(requestedPath)
    const contentType = contentTypes[path.extname(requestedPath).toLowerCase()] ?? "application/octet-stream"

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType,
      },
    })
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }
}
