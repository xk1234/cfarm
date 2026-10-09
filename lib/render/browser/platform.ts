/**
 * Browser render platform for the live preview: Fabric's browser build, the
 * bundled faces loaded through `FontFace` from the font route, DOM canvases.
 * Uses the same layout and painter as the server; server PNGs stay
 * authoritative (rare sub-pixel line-break differences are acceptable).
 */
import * as fabric from "fabric"

import { checkImageBytes, ASSET_LIMITS } from "../assets"
import { AssetLoadError, listFonts, type LoadedAsset, type RenderMime } from "../engine"
import { selectFontFace } from "../fonts"
import { createContextMeasurer, type TextMeasurer } from "../layout/measure"
import type { DecodedImage, FabricModule, FabricStaticCanvas, PlatformCanvas, RenderPlatform } from "../platform"

export type BrowserPlatformOptions = {
  /** URL of a bundled font file (registry `file`). Default `/api/fonts/<file>`. */
  fontUrl?: (file: string) => string
}

const MAX_DECODED_SIDE = 4096

export function defaultFontUrl(file: string): string {
  return `/api/fonts/${encodeURIComponent(file)}`
}

export function browserRenderPlatform(options: BrowserPlatformOptions = {}): RenderPlatform {
  const fontUrl = options.fontUrl ?? defaultFontUrl
  const loaded = new Map<string, Promise<void>>()
  let measurer: TextMeasurer | null = null

  const createCanvas = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    return canvas
  }

  return {
    name: "browser",
    async fabric() {
      return fabric as unknown as FabricModule
    },
    async ensureFonts(faces) {
      await Promise.all(
        faces.map(({ family, weight }) => {
          const selected = selectFontFace(family, weight)
          if (!selected) return Promise.resolve()
          const face = selected.face
          const key = `${face.family}|${face.file}`
          let p = loaded.get(key)
          if (!p) {
            const descriptorWeight = face.variable ? `${Math.min(...face.weights)} ${Math.max(...face.weights)}` : String(face.weights[0])
            const ff = new FontFace(face.family, `url(${fontUrl(face.file)})`, { weight: descriptorWeight, style: "normal" })
            p = ff.load().then((f) => {
              document.fonts.add(f)
            })
            loaded.set(key, p)
          }
          return p
        })
      )
    },
    measurer() {
      measurer ??= createContextMeasurer(createCanvas(8, 8).getContext("2d")!)
      return measurer
    },
    async decodeImage(asset: LoadedAsset): Promise<DecodedImage> {
      const type = checkImageBytes(asset.bytes, "Image")
      const blob = new Blob([asset.bytes as BlobPart], { type })
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(blob)
      } catch (err) {
        throw new AssetLoadError("asset.unsupported_type", `Image could not be decoded: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (bitmap.width * bitmap.height > ASSET_LIMITS.maxPixels) {
        bitmap.close()
        throw new AssetLoadError("asset.too_large", "Image exceeds 50 MP.")
      }
      const k = Math.min(1, MAX_DECODED_SIDE / Math.max(bitmap.width, bitmap.height))
      if (k === 1) return { element: bitmap, width: bitmap.width, height: bitmap.height }
      const canvas = createCanvas(bitmap.width * k, bitmap.height * k)
      const ctx = canvas.getContext("2d")!
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      return { element: canvas, width: canvas.width, height: canvas.height }
    },
    createCanvas(width, height): PlatformCanvas {
      return createCanvas(width, height)
    },
    async encode(canvas: FabricStaticCanvas, mime: RenderMime, quality: number | undefined): Promise<Uint8Array> {
      const el = canvas.getElement()
      const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, mime, quality))
      if (!blob) throw new Error(`The browser could not encode ${mime}.`)
      return new Uint8Array(await blob.arrayBuffer())
    },
  }
}

/** Every bundled face file, for preloading (e.g. a font picker). */
export function bundledFontFiles(): string[] {
  return [...new Set(listFonts().map((f) => f.file))]
}
