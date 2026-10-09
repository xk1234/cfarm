/**
 * Platform seam between the isomorphic engine and its two hosts:
 * - server: `fabric/node` + node-canvas + sharp (`./node/platform`)
 * - browser: `fabric` + DOM canvas + FontFace (`./browser/platform`)
 *
 * Layout and painting are shared; only font loading, image decoding,
 * measuring contexts and encoding differ. Isomorphic: no Node APIs here.
 */
import type * as FabricNS from "fabric"

import type { LoadedAsset, RenderMime } from "./engine"
import type { TextMeasurer } from "./layout/measure"

export type FabricModule = typeof FabricNS
export type FabricStaticCanvas = InstanceType<FabricModule["StaticCanvas"]>

/** A decoded raster that Fabric and `ctx.drawImage` accept on this platform. */
export type DecodedImage = {
  element: CanvasImageSource
  width: number
  height: number
}

/** A 2D canvas element created by the platform (node-canvas Canvas or HTMLCanvasElement). */
export type PlatformCanvas = {
  width: number
  height: number
  getContext(type: "2d"): CanvasRenderingContext2D | null
}

export interface RenderPlatform {
  readonly name: "node" | "browser"
  /** The Fabric namespace for this platform (`fabric/node` or `fabric`). */
  fabric(): Promise<FabricModule>
  /** Makes the given families usable for measuring and drawing. */
  ensureFonts(faces: readonly { family: string; weight: number }[]): Promise<void>
  /** Text measurer over this platform's canvas text stack. */
  measurer(): TextMeasurer
  /** Decodes image bytes (EXIF-rotated, size-capped). Throws AssetLoadError. */
  decodeImage(asset: LoadedAsset): Promise<DecodedImage>
  createCanvas(width: number, height: number): PlatformCanvas
  /** Encodes a rendered Fabric canvas. */
  encode(canvas: FabricStaticCanvas, mime: RenderMime, quality: number | undefined): Promise<Uint8Array>
}

let registered: RenderPlatform | null = null
let loading: Promise<RenderPlatform> | null = null

/** Installs the platform used by `renderSpec` (the browser entry and tests call this). */
export function setRenderPlatform(platform: RenderPlatform | null): void {
  registered = platform
  loading = null
}

/**
 * The active platform. On the server it is loaded on first use; in the
 * browser `lib/render/browser` must have been imported (it registers itself).
 * Next replaces `typeof window` at compile time, so the server branch and its
 * native imports never reach client bundles.
 */
export async function getRenderPlatform(): Promise<RenderPlatform> {
  if (registered) return registered
  if (typeof window === "undefined") {
    loading ??= import("./node/platform").then((m) => {
      registered ??= m.nodeRenderPlatform()
      return registered
    })
    return loading
  }
  throw new Error('No render platform: import "@/lib/render/browser" before rendering in the browser.')
}
