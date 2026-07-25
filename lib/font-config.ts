import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Single source of truth for the bundled fallback font used by the
// slideshow SVG renderer. The Next app and the Appwrite job-worker both
// rasterize `<text>` through sharp/libvips, which relies on fontconfig — and
// the node-22 (Alpine) runtime ships NO fonts and NO fontconfig config, so
// every glyph collapses to .notdef tofu. Bundling a real TTF and pointing
// fontconfig at it (via FONTCONFIG_FILE) is the only network-free, root-free
// fix.
//
// To swap the bundled font: replace assets/fonts/Inter-Variable.ttf, update
// the family name(s) below, and re-run `pnpm appwrite:sync-shared`.

/** Font family name exposed to fontconfig for the bundled TTF. */
export const BUNDLED_FONT_FAMILY = "Inter"

/** The TTF filename inside the bundled font directory. */
export const BUNDLED_FONT_FILE = "Inter-Variable.ttf"

// Brand/proprietary font names that must never be committed but appear in
// existing slideshow records. Each maps to the bundled family so the SVG
// font-family stack resolves to a real glyph set instead of nothing.
const FONT_REPLACEMENTS: Record<string, string> = {
  "TikTok Display Medium": BUNDLED_FONT_FAMILY,
  "TikTok Display": BUNDLED_FONT_FAMILY,
}

// CSS generic-family keywords are honoured by fontconfig directly and must
// pass through untouched (mapping them to Inter would change intent).
const CSS_GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "inherit",
  "initial",
  "unset",
])

/**
 * Resolve a slideshow `font` value to a font-family name that the bundled
 * fontconfig config can actually rasterize. Unknown or proprietary family
 * names fall back to the bundled family rather than rendering as tofu.
 */
export function resolveSlideshowFont(requested?: string): string {
  if (!requested) return BUNDLED_FONT_FAMILY
  if (requested === BUNDLED_FONT_FAMILY) return BUNDLED_FONT_FAMILY
  const replacement = FONT_REPLACEMENTS[requested]
  if (replacement) return replacement
  if (CSS_GENERIC_FAMILIES.has(requested.toLowerCase())) return requested
  return BUNDLED_FONT_FAMILY
}

let configured = false
let warnedMissing = false

/**
 * Locate the bundled font directory. `process.cwd()` is not reliable — slideshow
 * rendering runs from temp working directories — so fall back to a path resolved
 * relative to this module before giving up.
 */
export function bundledFontDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "assets", "fonts"),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "assets",
      "fonts"
    ),
  ]
  return (
    candidates.find((dir) => existsSync(path.join(dir, BUNDLED_FONT_FILE))) ??
    null
  )
}

/**
 * Ensure fontconfig can find the bundled TTF in environments that ship no
 * default font config (notably the Appwrite node-22 Alpine runtime). Writes a
 * minimal fonts.conf — with the font directory resolved at runtime, since the
 * absolute path differs between the Next app and the function container — into
 * a temp cache and points FONTCONFIG_FILE at it. Idempotent; must be called
 * before the first `sharp()` call that rasterizes SVG `<text>`.
 *
 * Returns whether fontconfig was configured. A missing font directory is NOT
 * fatal: rendering falls back to whatever fonts the host provides, which is the
 * pre-existing behaviour. Hard-failing here would turn a cosmetic problem
 * (tofu glyphs) into a total rendering outage.
 */
export function configureFontconfig(fontDir?: string | null): boolean {
  const resolved = fontDir ?? bundledFontDir()
  if (!resolved) {
    if (!warnedMissing) {
      warnedMissing = true
      console.warn(
        "configureFontconfig: bundled font directory not found; falling back to host fonts. Slide text may render as tofu on hosts without fonts."
      )
    }
    return false
  }
  const absoluteDir = path.resolve(resolved)
  if (!existsSync(absoluteDir)) {
    if (!warnedMissing) {
      warnedMissing = true
      console.warn(
        `configureFontconfig: bundled font directory not found: ${absoluteDir}; falling back to host fonts.`
      )
    }
    return false
  }
  const cacheDir = path.join(os.tmpdir(), "cfarm-fontconfig")
  try {
    mkdirSync(cacheDir, { recursive: true })
  } catch {
    /* already present */
  }
  const confPath = path.join(cacheDir, "fonts.conf")
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${absoluteDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`
  if (!existsSync(confPath) || readFileSync(confPath, "utf8") !== conf) {
    writeFileSync(confPath, conf)
  }
  if (process.env.FONTCONFIG_FILE !== confPath) {
    process.env.FONTCONFIG_FILE = confPath
  }
  configured = true
  return true
}

/** Whether configureFontconfig has run in this process. For tests. */
export function fontconfigConfigured(): boolean {
  return configured
}

/** Reset module state. Tests only — never call from app code. */
export function __resetFontconfigForTests(): void {
  configured = false
  delete process.env.FONTCONFIG_FILE
}