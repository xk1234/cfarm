import { renderedSlideSvg, type SlideshowSlide } from "@/lib/slideshow-renderer"

export type SlideshowRasterInput = {
  slide: SlideshowSlide
  sourceUrl: string
  overlayUrl?: string
  aspectRatio?: string
  font?: string
  iconUrls?: string[]
  imageItemUrls?: string[]
}

export async function renderSlideshowSlideBuffers(input: SlideshowRasterInput) {
  const svg = renderedSlideSvg(input.slide, input.sourceUrl, input.overlayUrl, {
    aspectRatio: input.aspectRatio,
    font: input.font,
    iconUrls: input.iconUrls,
    imageItemUrls: input.imageItemUrls,
  })
  const sharp = (await import("sharp")).default
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return { svg, png }
}
