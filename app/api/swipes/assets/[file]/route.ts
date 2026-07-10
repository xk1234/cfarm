import { readFile } from "node:fs/promises"
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

  // Serve from Appwrite Storage when configured; fall back to the filesystem.
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
      // Not in Appwrite -> fall back to fs.
    }
  }

  const assetPath = path.join(process.cwd(), "data", "swipes", "assets", safeFile)
  try {
    const body = await readFile(assetPath)
    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType,
      },
    })
  } catch {
    return NextResponse.json({ error: "Swipe asset not found" }, { status: 404 })
  }
}
