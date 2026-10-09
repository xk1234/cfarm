import path from "node:path"

import { loadImage, registerFont } from "canvas"

import {
  BUNDLED_FONT_FAMILY,
  BUNDLED_FONT_FILE,
  bundledFontDir,
} from "@/lib/font-config"
import { populateSlideshowFabricCanvas } from "@/lib/slideshow-fabric-canvas"
import {
  slideshowFabricScene,
  type SlideshowSlide,
} from "@/lib/slideshow-renderer"

export type SlideshowRasterInput = {
  slide: SlideshowSlide
  sourceUrl: string
  overlayUrl?: string
  aspectRatio?: string
  font?: string
  iconUrls?: string[]
}

let fontRegistered = false

function registerBundledFabricFont() {
  if (fontRegistered) return
  const fontDir = bundledFontDir()
  if (!fontDir) return
  registerFont(path.join(fontDir, BUNDLED_FONT_FILE), {
    family: BUNDLED_FONT_FAMILY,
  })
  fontRegistered = true
}

/** Render a slideshow through Fabric.js and return its editable SVG + PNG. */
export async function renderSlideshowSlideBuffers(input: SlideshowRasterInput) {
  registerBundledFabricFont()
  const fabric = await import("fabric/node")
  const scene = slideshowFabricScene(
    input.slide,
    input.sourceUrl,
    input.overlayUrl,
    {
      aspectRatio: input.aspectRatio,
      font: input.font,
      iconUrls: input.iconUrls,
    }
  )
  const canvas = new fabric.StaticCanvas(undefined, {
    width: scene.width,
    height: scene.height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  })

  try {
    const nodeRuntime = {
      ...fabric,
      FabricImage: {
        fromURL: async (url: string) => {
          const source = dataUriBuffer(url) ?? url
          const image = await loadImage(source)
          return new fabric.FabricImage(image as unknown as HTMLImageElement)
        },
      },
    }
    await populateSlideshowFabricCanvas(nodeRuntime, canvas, scene)
    const svg = canvas.toSVG({ suppressPreamble: false })
    const pngDataUrl = canvas.toDataURL({ format: "png", multiplier: 1 })
    const png = Buffer.from(
      pngDataUrl.slice(pngDataUrl.indexOf(",") + 1),
      "base64"
    )
    return { svg, png }
  } finally {
    await canvas.dispose()
  }
}

function dataUriBuffer(value: string) {
  const match = value.match(/^data:[^;,]+;base64,([\s\S]+)$/)
  return match ? Buffer.from(match[1], "base64") : null
}
