import path from "node:path"

import { bucketForPath, fileIdForPath } from "@/lib/appwrite-stores"
import { appwriteFileResponse } from "@/lib/appwrite-storage-response"

export const dynamic = "force-dynamic"

function contentTypeFor(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  return extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : extension === ".webp"
      ? "image/webp"
      : "image/png"
}

export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> }
) {
  const { file } = await context.params
  const safeFile = path.basename(file)
  const contentType = contentTypeFor(safeFile)
  const relPath = `swipes/assets/${safeFile}`

  return appwriteFileResponse({
    bucketId: bucketForPath(relPath),
    fileId: fileIdForPath(relPath),
    contentType,
    range: request.headers.get("range"),
  })
}
