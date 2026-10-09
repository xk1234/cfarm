/**
 * Shapes of pre-engine slideshow records (`lib/slideshows.ts`). Kept only so
 * stored records can still be rendered through the spec engine
 * (`./from-slideshow-record.ts`) until the record store is replaced by renders.
 */
export type SlideshowTextItem = {
  id: string
  text: string
  fontSize: string
  textSize: {
    width: number
    height: number
  }
  textStyle: string
  textAlign?: string
  textAnchor?: string
  textVerticalAnchor?: string
  textPlacement?: "top" | "center" | "bottom"
  textPosition: {
    x: number
    y: number
  }
}

export type SlideshowOverlayImage = {
  image_url: string
  source_image_url?: string
  padding: number
}

export type SlideshowOvalIcon = {
  image_url: string
  source_image_url?: string
  image_caption?: string
  key?: string
  x: number
  y: number
  scale: number
  rotation: number
}

export type SlideshowOvalIconLayout = {
  kind: "oval-icons"
  surrounding: SlideshowOvalIcon[]
}

export type SlideshowSlide = {
  id: string
  image_url: string
  source_image_url?: string
  overlayImage?: SlideshowOverlayImage
  overlay?: boolean
  imageFit?: "cover" | "contain" | "fit"
  textItems: SlideshowTextItem[]
  iconLayout?: SlideshowOvalIconLayout
}

export const defaultSlideshowAspectRatio = "9:16"
export const defaultSlideshowFont = "TikTok Display Medium"
