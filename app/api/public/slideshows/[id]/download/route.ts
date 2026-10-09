import JSZip from "jszip"

import { getRepositories } from "@/lib/data"
import { loadSharedSlideshow } from "@/lib/slideshow-share"
import { slideshowExportSlug } from "@/lib/slideshow-export"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const repos = getRepositories()
  const slideshow = token ? await loadSharedSlideshow(id, token, repos) : null
  if (!slideshow) return new Response("Not found", { status: 404 })
  if (slideshow.slides.length === 0) {
    return new Response("This slideshow has no rendered images.", { status: 409 })
  }

  const zip = new JSZip()
  const digits = Math.max(2, String(slideshow.slides.length).length)
  const blobs = await Promise.all(
    slideshow.slides.map((slide) => repos.blobs.get(slideshow.workspaceId, "renders", slide.fileId))
  )
  for (const [index, blob] of blobs.entries()) {
    if (!blob) return new Response(`Slide ${index + 1} is missing.`, { status: 409 })
    zip.file(`slide-${String(index + 1).padStart(digits, "0")}.${EXT[blob.mime] ?? "png"}`, blob.bytes)
  }
  const archive = await zip.generateAsync({ type: "uint8array" })
  const body = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slideshowExportSlug(slideshow.title)}.zip"`,
      "content-length": String(archive.byteLength),
      "cache-control": "private, max-age=0, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
