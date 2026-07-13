import path from "node:path"

import { NextResponse } from "next/server"

import { getAppwrite } from "@/lib/appwrite"
import { bucketForPath, fileIdForPath } from "@/lib/appwrite-stores"

export const dynamic = "force-dynamic"

function contentTypeFor(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  return extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : extension === ".webp"
      ? "image/webp"
      : "image/png"
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  const safeFile = path.basename(file)
  const contentType = contentTypeFor(safeFile)
  const relPath = `swipes/assets/${safeFile}`

  // Appwrite-only: serve from Storage, no filesystem fallback.
  const aw = getAppwrite()
  if (aw) {
    try {
      const view = await aw.storage.getFileView(
        bucketForPath(relPath),
        fileIdForPath(relPath)
      )
      return new NextResponse(Buffer.from(view as ArrayBuffer), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": contentType,
        },
      })
    } catch {
      // fall through to 404
    }
  }

  return NextResponse.json({ error: "Swipe asset not found" }, { status: 404 })
}
