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

export type SlideshowFontCategory =
  "Sans serif" | "Serif" | "Handwritten" | "Script" | "Display"

export type SlideshowFontFace = {
  family: string
  label: string
  file: string
  category: SlideshowFontCategory
  weight: number
  fontconfigFamily?: string
  fontconfigStyle?: string
}

/**
 * Fonts available to both the browser editor and the native renderer.
 *
 * `family` is the stable value persisted in slideshow/template JSON. Some
 * supplied files expose variants as fontconfig styles rather than standalone
 * families, so their native family/style pair is recorded explicitly.
 */
export const SLIDESHOW_FONT_FACES: readonly SlideshowFontFace[] = [
  {
    family: "Inter",
    label: "Inter",
    file: BUNDLED_FONT_FILE,
    category: "Sans serif",
    weight: 800,
  },
  {
    family: "Angelina",
    label: "Angelina",
    file: "Angelina.otf",
    category: "Script",
    weight: 400,
  },
  {
    family: "Buffalo",
    label: "Buffalo",
    file: "Buffalo-Regular.otf",
    category: "Script",
    weight: 400,
  },
  {
    family: "Casual Human",
    label: "Casual Human",
    file: "CasualHuman-Regular.otf",
    category: "Handwritten",
    weight: 400,
  },
  {
    family: "Casual Human Bold",
    label: "Casual Human Bold",
    file: "CasualHuman-Bold.otf",
    category: "Handwritten",
    weight: 700,
    fontconfigFamily: "Casual Human",
    fontconfigStyle: "Bold",
  },
  ...(["Regular", "Rough", "Smooth", "Texture"] as const).map((style) => ({
    family: `Hertical Sans ${style}`,
    label: `Hertical Sans ${style}`,
    file: `HerticalSans-${style}.otf`,
    category: "Display" as const,
    weight: 400,
    fontconfigFamily: "Hertical Sans",
    fontconfigStyle: style,
  })),
  ...(["Regular", "Rough", "Smooth", "Texture"] as const).map((style) => ({
    family: `Hertical Serif ${style}`,
    label: `Hertical Serif ${style}`,
    file: `HerticalSerif-${style}.otf`,
    category: "Display" as const,
    weight: 400,
    fontconfigFamily: "Hertical Serif",
    fontconfigStyle: style,
  })),
  {
    family: "Backind Maldina",
    label: "Backind Maldina",
    file: "Backind-Maldina.otf",
    category: "Serif",
    weight: 400,
  },
  {
    family: "Respano",
    label: "Respano",
    file: "Respano.otf",
    category: "Display",
    weight: 400,
  },
  {
    family: "Rossen Serif",
    label: "Rossen Serif",
    file: "Rossen-Serif.otf",
    category: "Serif",
    weight: 400,
  },
  {
    family: "Sunset Script",
    label: "Sunset Script",
    file: "Sunset-Script.otf",
    category: "Handwritten",
    weight: 400,
  },
  {
    family: "Superbusy Activity",
    label: "Superbusy Activity",
    file: "Superbusy-Activity-Regular.otf",
    category: "Handwritten",
    weight: 400,
  },
  {
    family: "Superbusy Activity Text",
    label: "Superbusy Activity Text",
    file: "Superbusy-Activity-Text.otf",
    category: "Handwritten",
    weight: 400,
  },
  {
    family: "Superbusy Activity Outline",
    label: "Superbusy Activity Outline",
    file: "Superbusy-Activity-Outline.otf",
    category: "Display",
    weight: 400,
  },
  {
    family: "Thumpa",
    label: "Thumpa",
    file: "Thumpa.otf",
    category: "Display",
    weight: 400,
  },
  {
    family: "Yoriglo",
    label: "Yoriglo",
    file: "Yoriglo.otf",
    category: "Script",
    weight: 400,
  },
]

export const slideshowFontOptions = [
  "TikTok Display Medium",
  ...SLIDESHOW_FONT_FACES.map(({ family }) => family),
  "Arial",
  "Serif",
] as const

export const PIN_SET_34A_FONT_ASSIGNMENTS = {
  "Glacial Indifference Regular": "Inter",
  "Glacial Indifference Bold": "Inter",
  "Jenthill Light": "Yoriglo",
  Angelina: "Angelina",
  "Hertical Sans Smooth": "Hertical Sans Smooth",
  Rumba: "Sunset Script",
  Sunflower: "Casual Human",
  Maldina: "Buffalo",
  Seattle: "Casual Human",
  Buffalo: "Buffalo",
} as const

// Brand/proprietary font names that must never be committed but appear in
// existing slideshow records. Each maps to the bundled family so the SVG
// font-family stack resolves to a real glyph set instead of nothing.
const FONT_REPLACEMENTS: Record<string, string> = {
  "TikTok Display Medium": BUNDLED_FONT_FAMILY,
  "TikTok Display": BUNDLED_FONT_FAMILY,
  Serif: "serif",
  "Glacial Indifference":
    PIN_SET_34A_FONT_ASSIGNMENTS["Glacial Indifference Regular"],
  "Glacial Indifference Regular":
    PIN_SET_34A_FONT_ASSIGNMENTS["Glacial Indifference Regular"],
  "Glacial Indifference Bold":
    PIN_SET_34A_FONT_ASSIGNMENTS["Glacial Indifference Bold"],
  "GlacialIndifference-Regular":
    PIN_SET_34A_FONT_ASSIGNMENTS["Glacial Indifference Regular"],
  "GlacialIndifference-Bold":
    PIN_SET_34A_FONT_ASSIGNMENTS["Glacial Indifference Bold"],
  "Jenthill Light": PIN_SET_34A_FONT_ASSIGNMENTS["Jenthill Light"],
  JenthillLight: PIN_SET_34A_FONT_ASSIGNMENTS["Jenthill Light"],
  "HerticalSans-Smooth": PIN_SET_34A_FONT_ASSIGNMENTS["Hertical Sans Smooth"],
  "Rumba-Regular": PIN_SET_34A_FONT_ASSIGNMENTS.Rumba,
  Rumba: PIN_SET_34A_FONT_ASSIGNMENTS.Rumba,
  Sunflower: PIN_SET_34A_FONT_ASSIGNMENTS.Sunflower,
  Maldina: PIN_SET_34A_FONT_ASSIGNMENTS.Maldina,
  "Seattle-Regular": PIN_SET_34A_FONT_ASSIGNMENTS.Seattle,
  Seattle: PIN_SET_34A_FONT_ASSIGNMENTS.Seattle,
  "Buffalo-Regular": PIN_SET_34A_FONT_ASSIGNMENTS.Buffalo,
}

const AVAILABLE_FONT_FAMILIES = new Set(
  SLIDESHOW_FONT_FACES.map(({ family }) => family)
)

const FONT_WEIGHTS = new Map(
  SLIDESHOW_FONT_FACES.map(({ family, weight }) => [family, weight])
)

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
  if (AVAILABLE_FONT_FAMILIES.has(requested)) return requested
  const replacement = FONT_REPLACEMENTS[requested]
  if (replacement) return replacement
  if (CSS_GENERIC_FAMILIES.has(requested.toLowerCase())) return requested
  if (requested === "Arial") return requested
  return BUNDLED_FONT_FAMILY
}

export function resolveSlideshowFontWeight(
  requested?: string,
  requestedWeight?: number
): number {
  if (Number.isFinite(requestedWeight)) {
    return Math.max(
      100,
      Math.min(900, Math.round(requestedWeight! / 100) * 100)
    )
  }
  const family = resolveSlideshowFont(requested)
  return FONT_WEIGHTS.get(family) ?? 800
}
