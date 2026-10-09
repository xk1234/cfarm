/**
 * Server render platform: `fabric/node` on node-canvas 3 (Pango/Cairo) with
 * the bundled fonts registered, sharp for decoding (EXIF rotation, AVIF/WebP,
 * pixel caps) and WebP encoding. Loaded lazily by `../platform`.
 */
import sharp from "sharp"

import { ASSET_LIMITS, checkImageBytes } from "../assets"
import { AssetLoadError, type LoadedAsset, type RenderMime } from "../engine"
import { createContextMeasurer, type TextMeasurer } from "../layout/measure"
import type { DecodedImage, FabricModule, FabricStaticCanvas, PlatformCanvas, RenderPlatform } from "../platform"
import { configureFontconfig, registerServerFonts } from "./fonts"

type NodeCanvasModule = typeof import("canvas")

/** Largest decoded side; bigger sources are downscaled on decode (memory bound). */
const MAX_DECODED_SIDE = 4096

let canvasModule: NodeCanvasModule | null = null
let fabricModule: Promise<FabricModule> | null = null
let measurer: TextMeasurer | null = null

async function nodeCanvas(): Promise<NodeCanvasModule> {
  if (canvasModule) return canvasModule
  configureFontconfig()
  const mod = (await import("canvas")) as unknown as Partial<NodeCanvasModule> & { default?: NodeCanvasModule }
  const resolved = (typeof mod.registerFont === "function" ? mod : mod.default) as NodeCanvasModule
  registerServerFonts(resolved.registerFont)
  canvasModule = resolved
  return resolved
}

/** Fonts are registered before anything else touches node-canvas. */
export async function prepareNodeRenderer(): Promise<void> {
  await nodeCanvas()
}

function fabricNode(): Promise<FabricModule> {
  fabricModule ??= nodeCanvas().then(async () => {
    const mod = (await import("fabric/node")) as unknown as FabricModule & { default?: FabricModule }
    return (mod.StaticCanvas ? mod : mod.default) as FabricModule
  })
  return fabricModule
}

export function nodeRenderPlatform(): RenderPlatform {
  return {
    name: "node",
    fabric: fabricNode,
    async ensureFonts() {
      // Every bundled face is registered at startup.
      await nodeCanvas()
    },
    measurer() {
      if (!canvasModule) throw new Error("ensureFonts() must run before measuring text.")
      measurer ??= createContextMeasurer(canvasModule.createCanvas(8, 8).getContext("2d") as never)
      return measurer
    },
    async decodeImage(asset: LoadedAsset): Promise<DecodedImage> {
      const mod = await nodeCanvas()
      const type = checkImageBytes(asset.bytes, "Image")
      const input = Buffer.from(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength)
      const svg = type === "image/svg+xml"
      let image: sharp.Sharp
      try {
        image = sharp(input, { limitInputPixels: ASSET_LIMITS.maxPixels, failOn: "error", animated: false, ...(svg ? { density: 288 } : {}) })
        const meta = await image.metadata()
        if (!meta.width || !meta.height) throw new AssetLoadError("asset.unsupported_type", "Image has no dimensions.")
        if (meta.width * meta.height > ASSET_LIMITS.maxPixels) {
          throw new AssetLoadError("asset.too_large", `Image is ${Math.round((meta.width * meta.height) / 1e6)} MP; the maximum is 50 MP.`)
        }
      } catch (err) {
        if (err instanceof AssetLoadError) throw err
        const message = err instanceof Error ? err.message : String(err)
        if (/pixel limit/i.test(message)) throw new AssetLoadError("asset.too_large", "Image exceeds 50 MP.")
        throw new AssetLoadError("asset.unsupported_type", `Image could not be decoded: ${message}`)
      }
      const { data, info } = await image
        .rotate()
        .resize({ width: MAX_DECODED_SIDE, height: MAX_DECODED_SIDE, fit: "inside", withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const canvas = mod.createCanvas(info.width, info.height)
      const ctx = canvas.getContext("2d")
      const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
      ctx.putImageData(mod.createImageData(pixels, info.width, info.height), 0, 0)
      return { element: canvas as unknown as CanvasImageSource, width: info.width, height: info.height }
    },
    createCanvas(width: number, height: number): PlatformCanvas {
      if (!canvasModule) throw new Error("node-canvas is not loaded")
      return canvasModule.createCanvas(Math.max(1, width), Math.max(1, height)) as unknown as PlatformCanvas
    },
    async encode(canvas: FabricStaticCanvas, mime: RenderMime, quality: number | undefined): Promise<Uint8Array> {
      const node = (canvas as unknown as { getNodeCanvas(): import("canvas").Canvas }).getNodeCanvas()
      if (mime === "image/png") return new Uint8Array(node.toBuffer("image/png"))
      if (mime === "image/jpeg") return new Uint8Array(node.toBuffer("image/jpeg", { quality: quality ?? 0.92 }))
      const png = node.toBuffer("image/png")
      const webp = await sharp(png).webp({ quality: Math.round((quality ?? 0.9) * 100) }).toBuffer()
      return new Uint8Array(webp)
    },
  }
}
