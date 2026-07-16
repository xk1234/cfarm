import path from "node:path"

import { NextResponse } from "next/server"

import { bucketForPath, fileIdForPath } from "@/lib/appwrite-stores"
import { appwriteFileResponse } from "@/lib/appwrite-storage-response"

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

  return appwriteFileResponse({
    bucketId: bucketForPath(relPath),
    fileId: fileIdForPath(relPath),
    contentType,
    range: request.headers.get("range"),
  })
}
