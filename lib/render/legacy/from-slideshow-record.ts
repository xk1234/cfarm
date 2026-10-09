/**
 * Legacy slideshow record → spec mapping (doc 01 §5). Turns one stored
 * `SlideshowSlide` + settings into a literal single-slide SlideshowSpec, with
 * the old renderer's implicit rules (×4 font scale, safe-margin clamps,
 * fixed placements, `textStyle` colours) baked in as explicit numbers. The
 * engine itself has none of these rules.
 *
 * Fixes from doc 01 apply: `imageFit` and `background_color` are honoured,
 * the pink/red/navy presets get their real colours, "White 50%" renders dark
 * text, and the font family is the requested registry family (legacy
 * "TikTok Display*" names map to Inter explicitly).
 */
import { listFontFamilies } from "../engine"
import { selectFontFace } from "../fonts"
import { CANVAS_PRESETS, type CanvasPreset, type Layer, type Slide, type SlideshowSpec, type TextStyle } from "../spec"
import {
  defaultSlideshowAspectRatio,
  type SlideshowOvalIconLayout,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "./slideshow-record"

/** Media ids the legacy renderer feeds through an in-memory asset loader. */
export const LEGACY_SOURCE_MEDIA = "legacy-source"
export const LEGACY_OVERLAY_MEDIA = "legacy-overlay"
export const legacyIconMedia = (index: number) => `legacy-icon-${index + 1}`

export type LegacySlideshowSettings = {
  aspect_ratio?: string
  font?: string
  background_color?: string
}

const LEGACY_FONT_ALIASES: Record<string, string> = {
  "TikTok Display Medium": "Inter",
  "TikTok Display": "Inter",
}

export function legacyFontFamily(requested: string | undefined): string {
  if (!requested) return "Inter"
  if (LEGACY_FONT_ALIASES[requested]) return LEGACY_FONT_ALIASES[requested]
  return listFontFamilies().includes(requested) ? requested : "Inter"
}

export function legacyCanvasSize(aspectRatio: string | undefined): { width: number; height: number } {
  const [w, h] = (aspectRatio || defaultSlideshowAspectRatio).split(":").map(Number)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: 1080, height: Math.max(320, Math.min(3840, Math.round((1080 * h) / w))) }
  }
  return { width: 1080, height: 1920 }
}

const COLOR_RE = /^(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^()]*\)|hsla?\([^()]*\))$/

/** Legacy `fontSize: "Npx"` → px = clamp(N × 4, 32, 96). */
export function legacyFontSize(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "")
  const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 12
  return Math.max(32, Math.min(96, n * 4))
}

type LegacyLook = { color: string; stroke?: boolean; background?: { color: string; opacity: number } }

/** doc 01 §5 textStyle table (with the colour bugs fixed). */
export function legacyTextLook(textStyle: string | undefined): LegacyLook {
  switch ((textStyle ?? "").replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())) {
    case "outline":
      return { color: "#FFFFFF", stroke: true }
    case "yellowText":
      return { color: "#FFF176" }
    case "blackText":
      return { color: "#111111" }
    case "background":
    case "whiteBackground":
      return { color: "#111111", background: { color: "#FFFFFF", opacity: 1 } }
    case "white50Background":
      return { color: "#111111", background: { color: "#FFFFFF", opacity: 0.56 } }
    case "blackBackground":
      return { color: "#FFFFFF", background: { color: "#111111", opacity: 0.9 } }
    case "black50Background":
      return { color: "#FFFFFF", background: { color: "#111111", opacity: 0.56 } }
    case "lightPink":
      return { color: "#FBCFE8" }
    case "mutedRed":
      return { color: "#F87171" }
    case "navyBlue":
      return { color: "#1E3A5F" }
    default:
      return { color: "#FFFFFF" }
  }
}

function clampPercent(value: number): number {
  const v = Number.isFinite(value) ? value : 50
  return Math.min(1, Math.max(0, v / 100))
}

function legacyTextLayer(item: SlideshowTextItem, index: number, W: number, H: number, family: string): Layer {
  const fs = legacyFontSize(item.fontSize)
  const boxWidth = Math.round(Math.max(10, Math.min(100, item.textSize?.width ?? 80)) * 0.01 * W)
  const align = item.textAlign === "left" || item.textAlign === "right" ? item.textAlign : "center"
  // Horizontal safe margins (old `textItemX`), baked into a literal x.
  const hMargin = item.textAnchor === "flush" ? Math.max(8, W * 0.015) : Math.max(20, W * 0.1)
  const rawX = clampPercent(item.textPosition?.x ?? 50) * W
  let x: number
  if (align === "left") x = Math.min(Math.max(hMargin, W - boxWidth - hMargin), Math.max(hMargin, rawX))
  else if (align === "right") x = Math.min(W - hMargin, Math.max(Math.min(W - hMargin, boxWidth + hMargin), rawX))
  else {
    const min = Math.min(W - hMargin, boxWidth / 2 + hMargin)
    x = Math.min(Math.max(min, W - boxWidth / 2 - hMargin), Math.max(min, rawX))
  }
  // Vertical placement (old `textItemY`): y was the centre of the first line.
  const vMargin = item.textVerticalAnchor === "flush" ? Math.max(20, H * 0.05) : Math.max(32, H * 0.16)
  const lineBox = fs * 1.12
  let y: number
  if (item.textPlacement === "top") y = vMargin
  else if (item.textPlacement === "bottom") y = Math.max(vMargin, H - vMargin)
  else if (item.textPlacement === "center") y = H * 0.45
  else {
    const min = Math.max(20, lineBox / 2 + 20)
    y = Math.min(Math.max(min, H - lineBox / 2 - 20), Math.max(min, clampPercent(item.textPosition?.y ?? 50) * H))
  }

  const look = legacyTextLook(item.textStyle)
  const padX = look.background ? fs * 0.28 : 0
  const style: TextStyle = {
    fontFamily: family,
    // The old renderer always asked for 800; use the family's nearest real face.
    fontWeight: selectFontFace(family, 800)?.weight ?? 800,
    fontSize: fs,
    color: look.color,
    align,
    lineHeight: 1.12,
    overflow: "clip",
    ...(look.stroke ? { stroke: { color: "rgba(0,0,0,0.88)", width: Math.max(6, fs * 0.13), join: "round" as const } } : {}),
    ...(look.background
      ? {
          background: {
            mode: "lines" as const,
            color: look.background.color,
            opacity: look.background.opacity,
            paddingX: padX,
            paddingY: fs * 0.1,
            radius: Math.max(3, fs * 0.06),
          },
        }
      : {}),
  }
  // Pills sit inside the engine's frame, so widen it to keep the old wrap width.
  const frameWidth = boxWidth + 2 * padX
  const anchorX = align === "left" ? x - padX : align === "right" ? x + padX : x
  return {
    id: item.id || `text-${index + 1}`,
    type: "text",
    // Legacy text is literal: escape `{{` so it is never read as a slot.
    text: (item.text ?? "").replace(/\{\{/g, "{{{{"),
    style,
    frame: {
      x: round(anchorX),
      y: round(y - lineBox / 2 - (look.background ? fs * 0.1 : 0)),
      width: round(frameWidth),
      anchor: align === "left" ? "top-left" : align === "right" ? "top-right" : "top",
    },
  }
}

function legacyIconLayers(layout: SlideshowOvalIconLayout, W: number, H: number, iconCount: number): Layer[] {
  const card = (id: string, media: string, x: number, y: number, size: number, rotation: number, fill: string): Layer => ({
    id,
    type: "group",
    rotation,
    frame: { x: round(x), y: round(y), width: round(size), height: round(size), anchor: "center" },
    children: [
      { id: `${id}-card`, type: "shape", shape: "rect", fill, cornerRadius: "22%", stroke: { color: "#27231F", width: 5 }, frame: { inset: 0 } },
      { id: `${id}-image`, type: "image", src: { media }, fit: "contain", frame: { x: "50%", y: "50%", width: "74%", height: "74%", anchor: "center" } },
    ],
  })
  const cx = W * 0.5
  const cy = H * 0.5
  const ry = H * 0.318
  const layers: Layer[] = [
    { id: "icon-backdrop", type: "shape", shape: "rect", fill: "#F6F1E8", frame: { inset: 0 } },
    {
      id: "icon-oval",
      type: "shape",
      shape: "ellipse",
      fill: "#FFFDF9",
      stroke: { color: "#27231F", width: 7 },
      frame: { x: "50%", y: "50%", width: "74.4%", height: "63.6%", anchor: "center" },
    },
  ]
  layout.surrounding.forEach((icon, i) => {
    if (i >= iconCount) return
    const size = W * 0.135 * Math.max(0.7, Math.min(1.3, icon.scale))
    layers.push(card(`icon-${i + 1}`, legacyIconMedia(i), (icon.x / 100) * W, (icon.y / 100) * H, size, icon.rotation ?? 0, "#FFFDF8"))
  })
  layers.push(card("icon-focal", LEGACY_SOURCE_MEDIA, cx, cy - ry * 0.5, W * 0.16, 0, "#EEE6F7"))
  return layers
}

/**
 * One legacy slide as a literal single-slide spec. Image layers reference
 * `LEGACY_SOURCE_MEDIA`, `LEGACY_OVERLAY_MEDIA` (when `hasOverlay`) and
 * `legacyIconMedia(i)` (for the first `iconCount` icons).
 */
export function legacySlideSpec(input: {
  slide: SlideshowSlide
  settings?: LegacySlideshowSettings
  hasOverlay?: boolean
  iconCount?: number
}): SlideshowSpec & { slides: Slide[] } {
  const { slide } = input
  const settings = input.settings ?? {}
  const { width: W, height: H } = legacyCanvasSize(settings.aspect_ratio)
  const family = legacyFontFamily(settings.font)
  const background = settings.background_color && COLOR_RE.test(settings.background_color.trim()) ? settings.background_color.trim() : "#111111"
  const layers: Layer[] = []

  if (slide.iconLayout) {
    layers.push(...legacyIconLayers(slide.iconLayout, W, H, input.iconCount ?? 0))
  } else {
    layers.push({
      id: "image",
      type: "image",
      src: { media: LEGACY_SOURCE_MEDIA },
      fit: slide.imageFit === "contain" || slide.imageFit === "fit" ? "contain" : "cover",
      frame: { inset: 0 },
    })
  }
  if (slide.overlay) {
    layers.push({ id: "overlay", type: "shape", shape: "rect", fill: "#000000", opacity: 0.2, frame: { inset: 0 } })
  }
  if (slide.overlayImage && input.hasOverlay) {
    const padding = Math.max(0, Math.min(40, slide.overlayImage.padding ?? 0))
    const w = Math.round(W * Math.max(20, 100 - padding * 2) * 0.01)
    const h = Math.round(w * (9 / 16))
    const top = Math.round(Math.min(H - h, Math.max(0, H * 0.5 - h * 0.42)))
    layers.push({
      id: "overlay-image",
      type: "image",
      src: { media: LEGACY_OVERLAY_MEDIA },
      fit: "cover",
      frame: { x: Math.round((W - w) / 2), y: top, width: w, height: h },
    })
  }
  ;(slide.textItems ?? []).forEach((item, i) => {
    if ((item.text ?? "").trim()) layers.push(legacyTextLayer(item, i, W, H, family))
  })

  const preset = (Object.keys(CANVAS_PRESETS) as CanvasPreset[]).find((p) => {
    const [rw, rh] = CANVAS_PRESETS[p]
    return Math.round((1080 * rh) / rw) === H
  })
  return {
    version: 1,
    name: "Legacy slideshow slide",
    canvas: preset ? { preset, background } : { width: W, height: H, background },
    fonts: [{ family }],
    slides: [{ id: sanitizeId(slide.id) || "slide", background, layers: dedupeIds(layers) }],
  }
}

function sanitizeId(id: string | undefined): string {
  return (id ?? "").replace(/[^A-Za-z0-9_.~ -]/g, "-").slice(0, 120)
}

function dedupeIds(layers: Layer[]): Layer[] {
  const seen = new Set<string>()
  return layers.map((layer, i) => {
    let id = sanitizeId(layer.id) || `layer-${i + 1}`
    if (!/^[A-Za-z0-9]/.test(id)) id = `l${id}`
    while (seen.has(id)) id = `${id}-${i + 1}`
    seen.add(id)
    return { ...layer, id } as Layer
  })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
