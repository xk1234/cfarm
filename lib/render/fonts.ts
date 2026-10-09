/**
 * Font face selection shared by the server and browser render platforms.
 *
 * The registry (`listFonts()` in ./engine) lists one entry per face file in
 * `assets/fonts/`. Every family is registered under its registry name on both
 * platforms (node-canvas `registerFont({family})`, browser `FontFace(family)`),
 * so a spec's `fontFamily` always renders with its own glyphs. Before the
 * engine, every family silently rendered as Inter.
 *
 * Inter ships as one variable font. Pango (node-canvas) ignores the weight axis
 * of a registered variable font, so the server registers static instances
 * generated from it (`assets/fonts/static/Inter-<weight>.ttf`). Browsers use
 * the variable file directly.
 *
 * Isomorphic: no Node APIs.
 */
import { listFonts, type FontFaceInfo } from "./engine"

/** Static Inter instances (server only), one per weight of the variable font. */
export const INTER_STATIC_FILES: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries([100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => [w, `static/Inter-${w}.ttf`]))
)

/** A concrete face to draw with: family, the nearest available weight, and synthetic italics. */
export type SelectedFace = {
  family: string
  weight: number
  /** No bundled face is italic; italics are drawn as an oblique skew. */
  syntheticItalic: boolean
  face: FontFaceInfo
}

/**
 * Picks the face for `family` at `weight`: an exact weight when the family has
 * it, otherwise the nearest one (ties go to the heavier face). Returns null for
 * unknown families. Validation reports unknown families/weights before render.
 */
export function selectFontFace(
  family: string,
  weight: number,
  style: "normal" | "italic" = "normal",
  registry: readonly FontFaceInfo[] = listFonts()
): SelectedFace | null {
  const faces = registry.filter((f) => f.family === family)
  if (faces.length === 0) return null
  let best: { face: FontFaceInfo; weight: number; distance: number } | null = null
  for (const face of faces) {
    for (const w of face.weights) {
      const distance = Math.abs(w - weight) - (w > weight ? 0.5 : 0)
      if (!best || distance < best.distance) best = { face, weight: w, distance }
    }
  }
  if (!best) return null
  return { family, weight: best.weight, syntheticItalic: style === "italic", face: best.face }
}

/** CSS / canvas font shorthand for a selected face (italic is synthesized, never requested). */
export function canvasFont(face: Pick<SelectedFace, "family" | "weight">, sizePx: number): string {
  return `${face.weight} ${roundPx(sizePx)}px "${face.family.replace(/"/g, "")}"`
}

function roundPx(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** One file to register with node-canvas: family + weight + file under `assets/fonts/`. */
export type ServerFontFile = { family: string; weight: number; file: string }

/** Every face file the server registers (static Inter instances replace the variable file). */
export function serverFontFiles(registry: readonly FontFaceInfo[] = listFonts()): ServerFontFile[] {
  const out: ServerFontFile[] = []
  for (const face of registry) {
    if (face.family === "Inter" && face.variable) {
      for (const w of face.weights) {
        const file = INTER_STATIC_FILES[w]
        if (file) out.push({ family: "Inter", weight: w, file })
      }
      continue
    }
    for (const w of face.weights) out.push({ family: face.family, weight: w, file: face.file })
  }
  return out
}

/** Characters no bundled family covers (emoji, CJK, …) — reported as `font.fallback_glyphs`. */
const FALLBACK_GLYPH_RE =
  /[\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]/u

export function hasFallbackGlyphs(text: string): boolean {
  return FALLBACK_GLYPH_RE.test(text)
}
