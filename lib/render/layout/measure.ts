/**
 * Text measurement seam (doc 01 §2.6). Layout depends only on this interface;
 * the server implements it over a node-canvas 2D context and the browser over
 * an HTML canvas, both with the same registered font files.
 */
import { canvasFont, type SelectedFace } from "../fonts"

/** Font-wide vertical metrics as a fraction of the font size. */
export type FontMetrics = { ascent: number; descent: number }

export interface TextMeasurer {
  /** Advance width in px of `text` at `sizePx` (no letter spacing). */
  width(face: SelectedFace, sizePx: number, text: string): number
  /** Ascent/descent of the face, per 1px of font size. */
  metrics(face: SelectedFace): FontMetrics
}

/** The subset of CanvasRenderingContext2D used for measuring (node-canvas and DOM). */
export type MeasuringContext = {
  font: string
  measureText(text: string): {
    width: number
    emHeightAscent?: number
    emHeightDescent?: number
    fontBoundingBoxAscent?: number
    fontBoundingBoxDescent?: number
    actualBoundingBoxAscent?: number
    actualBoundingBoxDescent?: number
  }
}

const METRIC_SIZE = 1000

/** A caching measurer over a 2D context whose fonts are already registered/loaded. */
export function createContextMeasurer(ctx: MeasuringContext): TextMeasurer {
  const widths = new Map<string, number>()
  const metrics = new Map<string, FontMetrics>()
  return {
    width(face, sizePx, text) {
      if (!text) return 0
      const font = canvasFont(face, sizePx)
      const key = `${font}\u0000${text}`
      const hit = widths.get(key)
      if (hit !== undefined) return hit
      ctx.font = font
      const w = ctx.measureText(text).width
      if (widths.size > 50_000) widths.clear()
      widths.set(key, w)
      return w
    },
    metrics(face) {
      const font = canvasFont(face, METRIC_SIZE)
      const hit = metrics.get(font)
      if (hit) return hit
      ctx.font = font
      const m = ctx.measureText("Hg")
      const ascent =
        positive(m.fontBoundingBoxAscent) ?? positive(m.emHeightAscent) ?? positive(m.actualBoundingBoxAscent) ?? METRIC_SIZE * 0.8
      const descent =
        positive(m.fontBoundingBoxDescent) ?? positive(m.emHeightDescent) ?? positive(m.actualBoundingBoxDescent) ?? METRIC_SIZE * 0.2
      const out = { ascent: ascent / METRIC_SIZE, descent: descent / METRIC_SIZE }
      metrics.set(font, out)
      return out
    },
  }
}

function positive(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Deterministic measurer for unit tests: every character advances
 * `advance × size` px (wide characters 2×); ascent .8, descent .2.
 */
export function createFixedMeasurer(advance = 0.5): TextMeasurer {
  return {
    width(_face, sizePx, text) {
      let units = 0
      for (const ch of text) units += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch) ? 2 : 1
      return units * advance * sizePx
    },
    metrics() {
      return { ascent: 0.8, descent: 0.2 }
    },
  }
}
