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
  Serif: "serif",
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
