import { readFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  const safeFile = path.basename(file)
  const assetPath = path.join(process.cwd(), "data", "swipes", "assets", safeFile)

  try {
    const body = await readFile(assetPath)
    const extension = path.extname(safeFile).toLowerCase()
    const contentType =
      extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".webp"
          ? "image/webp"
          : "image/png"

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
