import { bucketForPath, fileIdForPath } from "@/lib/store-identity"
import { loadSharedGeneratedVideo } from "@/lib/generated-video-share"
import {
  generatedVideoAssetPath,
  generatedVideoContentType,
} from "@/lib/public-generated-video-assets"
import { railwayFileResponse } from "@/lib/railway/storage-response"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const query = new URL(request.url).searchParams
  const token = query.get("token") ?? ""
  const kind = query.get("kind") === "thumbnail" ? "thumbnail" : "video"
  const video = token ? await loadSharedGeneratedVideo(id, token) : null
  if (!video) return new Response("Not found", { status: 404 })

  const relativePath = generatedVideoAssetPath(
    kind === "thumbnail" ? (video.previewUrl ?? "") : (video.videoUrl ?? "")
  )
  if (!relativePath) return new Response("Not found", { status: 404 })

  const response = await railwayFileResponse({
    bucketId: bucketForPath(relativePath),
    fileId: fileIdForPath(relativePath),
    contentType: generatedVideoContentType(relativePath),
    range: request.headers.get("range"),
  })
  if (query.get("download") === "1" && response.ok) {
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="${kind === "thumbnail" ? "thumbnail" : "video"}${extension(relativePath)}"`
    )
  }
  return response
}

function extension(relativePath: string) {
  const match = relativePath.match(/\.[a-z0-9]+$/i)
  return match?.[0] ?? ""
}
