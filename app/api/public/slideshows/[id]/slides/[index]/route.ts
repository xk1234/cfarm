import { bucketForPath, fileIdForPath } from "@/lib/appwrite-stores"
import {
  slideshowImageContentType,
  slideshowOutputAssetPath,
} from "@/lib/public-slideshow-assets"
import { loadSharedSlideshow } from "@/lib/slideshow-share"
import { railwayFileResponse } from "@/lib/railway/storage-response"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; index: string }>
  }
) {
  const { id, index: rawIndex } = await params
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const slideshow = token ? await loadSharedSlideshow(id, token) : null
  if (!slideshow) return new Response("Not found", { status: 404 })

  const index = Number(rawIndex)
  if (!Number.isSafeInteger(index) || index < 1) {
    return new Response("Not found", { status: 404 })
  }
  const relativePath = slideshowOutputAssetPath(
    slideshow.output_images[index - 1] ?? ""
  )
  if (!relativePath) return new Response("Not found", { status: 404 })

  const responseInput = {
    bucketId: bucketForPath(relativePath),
    fileId: fileIdForPath(relativePath),
    contentType: slideshowImageContentType(relativePath),
    range: request.headers.get("range"),
  }
  return railwayFileResponse(responseInput)
}
