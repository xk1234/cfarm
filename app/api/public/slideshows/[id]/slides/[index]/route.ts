import { getRepositories } from "@/lib/data"
import { loadSharedSlideshow } from "@/lib/slideshow-share"

export const dynamic = "force-dynamic"

/** One rendered slide behind an HMAC share token (1-based index). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index: rawIndex } = await params
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const repos = getRepositories()
  const slideshow = token ? await loadSharedSlideshow(id, token, repos) : null
  if (!slideshow) return new Response("Not found", { status: 404 })

  const index = Number(rawIndex)
  if (!Number.isSafeInteger(index) || index < 1) {
    return new Response("Not found", { status: 404 })
  }
  const slide = slideshow.slides[index - 1]
  if (!slide) return new Response("Not found", { status: 404 })
  const blob = await repos.blobs.get(slideshow.workspaceId, "renders", slide.fileId)
  if (!blob) return new Response("Not found", { status: 404 })

  const body = blob.bytes.buffer.slice(
    blob.bytes.byteOffset,
    blob.bytes.byteOffset + blob.bytes.byteLength
  ) as ArrayBuffer
  return new Response(body, {
    headers: {
      "content-type": blob.mime,
      "content-length": String(blob.bytes.byteLength),
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  })
}
