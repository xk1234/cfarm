import { notFound } from "next/navigation"

import { PublicSlideshowShare } from "@/components/realfarm/public-slideshow-share"
import { publicSlideshowImageUrl } from "@/lib/public-slideshow-assets"
import { loadSharedSlideshow } from "@/lib/slideshow-share"

export const dynamic = "force-dynamic"

export default async function SharedSlideshowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const token = typeof query.token === "string" ? query.token : ""
  const slideshow = token ? await loadSharedSlideshow(id, token) : null
  if (!slideshow) notFound()

  return (
    <PublicSlideshowShare
      outputId={slideshow.id}
      token={token}
      title={slideshow.title}
      caption={slideshow.caption}
      hashtags={slideshow.hashtags}
      imageUrls={slideshow.output_images.map((_, index) =>
        publicSlideshowImageUrl({
          outputId: slideshow.id,
          token,
          index,
        })
      )}
    />
  )
}
