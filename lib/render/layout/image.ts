/**
 * Image fit math (doc 01 §2.3): cover / contain / fill / none with a focal
 * point and zoom. The result is the visible source rect and where it lands in
 * the box, so painting never draws outside the box.
 */
import type { ImagePlacement } from "../display-list"
import type { ImageFit } from "../spec"

export type FitResult = ImagePlacement & {
  /** Uniform scale applied to the source (max of x/y for `fill`). */
  scale: number
}

export function fitImage(
  intrinsic: { width: number; height: number },
  box: { width: number; height: number },
  fit: ImageFit,
  focal: { x: number; y: number } = { x: 0.5, y: 0.5 },
  zoom = 1
): FitResult {
  const iw = Math.max(1, intrinsic.width)
  const ih = Math.max(1, intrinsic.height)
  const bw = Math.max(0, box.width)
  const bh = Math.max(0, box.height)
  const z = Math.max(1, zoom)
  let scaleX: number
  let scaleY: number
  switch (fit) {
    case "cover": {
      const s = Math.max(bw / iw, bh / ih) * z
      scaleX = scaleY = s
      break
    }
    case "contain": {
      const s = Math.min(bw / iw, bh / ih) * z
      scaleX = scaleY = s
      break
    }
    case "fill":
      scaleX = (bw / iw) * z
      scaleY = (bh / ih) * z
      break
    case "none":
      scaleX = scaleY = z
      break
  }
  const sw = iw * scaleX
  const sh = ih * scaleY
  const ox = offset(sw, bw, focal.x)
  const oy = offset(sh, bh, focal.y)

  // Visible part of the scaled image inside the box.
  const dx = Math.max(0, ox)
  const dy = Math.max(0, oy)
  const dRight = Math.min(bw, ox + sw)
  const dBottom = Math.min(bh, oy + sh)
  const dw = Math.max(0, dRight - dx)
  const dh = Math.max(0, dBottom - dy)
  return {
    sx: (dx - ox) / scaleX,
    sy: (dy - oy) / scaleY,
    sw: dw / scaleX,
    sh: dh / scaleY,
    dx,
    dy,
    dw,
    dh,
    scale: Math.max(scaleX, scaleY),
  }
}

/** Centres a smaller image; otherwise keeps the focal point as central as the crop allows. */
function offset(scaled: number, box: number, focal: number): number {
  if (scaled <= box) return (box - scaled) / 2
  const ideal = box / 2 - focal * scaled
  return Math.min(0, Math.max(box - scaled, ideal))
}
