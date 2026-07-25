import JSZip from "jszip"

import { absoluteAssetUrl } from "@/lib/asset-urls"
import { loadSharedSlideshow } from "@/lib/slideshow-share"
import { slideshowExportSlug } from "@/lib/slideshow-export"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const slideshow = token ? await loadSharedSlideshow(id, token) : null
  if (!slideshow) return new Response("Not found", { status: 404 })
  if (slideshow.output_images.length === 0) {
    return new Response("This slideshow has no rendered images.", {
      status: 409,
    })
  }

  const zip = new JSZip()
  const digits = Math.max(2, String(slideshow.output_images.length).length)
  const images = await Promise.all(
    slideshow.output_images.map(async (url, index) => {
      const response = await fetch(absoluteAssetUrl(url), {
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        throw new Error(`Slide ${index + 1} could not be downloaded.`)
      }
      return {
        index,
        bytes: await response.arrayBuffer(),
      }
    })
  )
  for (const image of images) {
    zip.file(
      `slide-${String(image.index + 1).padStart(digits, "0")}.png`,
      image.bytes
    )
  }
  const archive = await zip.generateAsync({ type: "uint8array" })
  const body = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slideshowExportSlug(slideshow.title)}.zip"`,
      "cache-control": "private, max-age=0, no-store",
    },
  })
}
