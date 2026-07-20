import { clean } from "@/lib/guards"
import {
  textStyleToEditorColor,
  textStyleUsesStroke,
} from "@/lib/realfarm-slideshow-text-style-config"

export type SlideshowTextItem = {
  id: string
  text: string
  fontSize: string
  textSize: {
    width: number
    height: number
  }
  textStyle: string
  textAlign?: string
  textAnchor?: string
  textVerticalAnchor?: string
  textPlacement?: "top" | "center" | "bottom"
  textPosition: {
    x: number
    y: number
  }
}

export type SlideshowOverlayImage = {
  image_url: string
  source_image_url?: string
  padding: number
}

export type SlideshowOvalIcon = {
  image_url: string
  source_image_url?: string
  image_caption?: string
  key?: string
  x: number
  y: number
  scale: number
  rotation: number
}

export type SlideshowOvalIconLayout = {
  kind: "oval-icons"
  surrounding: SlideshowOvalIcon[]
}

export type SlideshowSlide = {
  id: string
  image_url: string
  source_image_url?: string
  overlayImage?: SlideshowOverlayImage
  overlay?: boolean
  imageFit?: "cover" | "contain" | "fit"
  textItems: SlideshowTextItem[]
  iconLayout?: SlideshowOvalIconLayout
}

export const slideshowOverlayOpacity = 0.2

export type SlideshowTextBounds = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export function slideshowTextPositionX(
  textAlign: string | undefined,
  textAnchor: string | undefined
) {
  const flush = textAnchor === "flush"
  if (textAlign === "left") return flush ? 1.5 : 10
  if (textAlign === "right") return flush ? 98.5 : 90
  return 50
}

export const defaultSlideshowAspectRatio = "9:16"
export const defaultSlideshowFont = "TikTok Display Medium"

export function renderedSlideSvg(
  slide: SlideshowSlide,
  sourceUrl: string,
  overlayUrl?: string,
  opts?: { aspectRatio?: string; font?: string; iconUrls?: string[] }
) {
  const { width, height } = slideDimensions(
    opts?.aspectRatio || defaultSlideshowAspectRatio
  )
  const font = opts?.font || defaultSlideshowFont
  const textItems = slide.textItems
  const overlayImageSvg =
    slide.overlayImage && overlayUrl
      ? renderedOverlayImageSvg(slide.overlayImage, overlayUrl, width, height)
      : null
  const overlayAlpha = slide.overlay ? slideshowOverlayOpacity : 0

  const baseLayers = slide.iconLayout
    ? renderedOvalIconsSvg(
        slide.iconLayout,
        sourceUrl,
        opts?.iconUrls,
        width,
        height
      )
    : [
        `<rect width="${width}" height="${height}" fill="#111"/>`,
        `<image href="${escapeXml(sourceUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`,
      ]

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...baseLayers,
    overlayAlpha > 0
      ? `<rect data-layer="overlay" width="${width}" height="${height}" fill="#000" opacity="${overlayAlpha}"/>`
      : null,
    overlayImageSvg,
    ...renderedTextItemsSvg(textItems, width, height, font),
    `</svg>`,
  ]
    .filter(Boolean)
    .join("")
}

function renderedOvalIconsSvg(
  layout: SlideshowOvalIconLayout,
  focalUrl: string,
  iconUrls: string[] | undefined,
  width: number,
  height: number
) {
  const cx = width * 0.5
  const cy = height * 0.5
  const rx = width * 0.372
  const ry = height * 0.318
  const baseSize = width * 0.135
  const surrounding = layout.surrounding.map((icon, index) => {
    const x = (icon.x / 100) * width
    const y = (icon.y / 100) * height
    const size = baseSize * Math.max(0.7, Math.min(1.3, icon.scale))
    const imageUrl = iconUrls?.[index] || icon.image_url
    return [
      `<g transform="translate(${round(x)} ${round(y)}) rotate(${round(icon.rotation)})">`,
      `<rect x="${round(-size / 2)}" y="${round(-size / 2)}" width="${round(size)}" height="${round(size)}" rx="${round(size * 0.22)}" fill="#fffdf8" stroke="#27231f" stroke-width="5"/>`,
      `<image href="${escapeXml(imageUrl)}" x="${round(-size * 0.37)}" y="${round(-size * 0.37)}" width="${round(size * 0.74)}" height="${round(size * 0.74)}" preserveAspectRatio="xMidYMid meet"/>`,
      `</g>`,
    ].join("")
  })
  const focalSize = width * 0.16
  const focalY = cy - ry * 0.5
  return [
    `<rect width="${width}" height="${height}" fill="#f6f1e8"/>`,
    `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(rx)}" ry="${round(ry)}" fill="#fffdf9" stroke="#27231f" stroke-width="7"/>`,
    ...surrounding,
    `<rect x="${round(cx - focalSize / 2)}" y="${round(focalY - focalSize / 2)}" width="${round(focalSize)}" height="${round(focalSize)}" rx="${round(focalSize * 0.22)}" fill="#eee6f7" stroke="#27231f" stroke-width="5"/>`,
    `<image href="${escapeXml(focalUrl)}" x="${round(cx - focalSize * 0.37)}" y="${round(focalY - focalSize * 0.37)}" width="${round(focalSize * 0.74)}" height="${round(focalSize * 0.74)}" preserveAspectRatio="xMidYMid meet"/>`,
  ]
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

export function slideDimensions(aspectRatio: string) {
  const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number)
  if (
    Number.isFinite(widthRatio) &&
    Number.isFinite(heightRatio) &&
    widthRatio > 0 &&
    heightRatio > 0
  ) {
    const width = 1080
    return { width, height: Math.round((width * heightRatio) / widthRatio) }
  }
  return { width: 1080, height: 1920 }
}

function renderedOverlayImageSvg(
  overlayImage: SlideshowOverlayImage,
  overlayUrl: string,
  slideWidth: number,
  slideHeight: number
) {
  const padding = Math.max(0, Math.min(40, overlayImage.padding))
  const overlayWidth = Math.round(
    slideWidth * Math.max(20, 100 - padding * 2) * 0.01
  )
  const overlayHeight = Math.round(overlayWidth * (9 / 16))
  const x = Math.round((slideWidth - overlayWidth) / 2)
  const y = Math.round(
    Math.min(
      slideHeight - overlayHeight,
      Math.max(0, slideHeight * 0.5 - overlayHeight * 0.42)
    )
  )

  return `<image href="${escapeXml(overlayUrl)}" x="${x}" y="${y}" width="${overlayWidth}" height="${overlayHeight}" preserveAspectRatio="xMidYMid slice"/>`
}

type RenderedTextItem = {
  item: SlideshowTextItem
  x: number
  y: number
  fontSize: number
  lineHeight: number
  lines: string[]
  blockHeight: number
  textBoxWidth: number
}

function renderedTextItemsSvg(
  items: SlideshowTextItem[],
  width: number,
  height: number,
  font: string
) {
  return layoutRenderedTextItems(items, width, height).map((rendered) =>
    renderedTextItemSvg(rendered, font)
  )
}

function layoutRenderedTextItems(
  items: SlideshowTextItem[],
  width: number,
  height: number
) {
  const groups = new Map<string, RenderedTextItem[]>()

  for (const item of items) {
    const prepared = prepareRenderedTextItem(item, width, height)
    const key = item.textPlacement
      ? `placement:${item.textPlacement}`
      : `position:${Math.round(prepared.y)}`
    groups.set(key, [...(groups.get(key) ?? []), prepared])
  }

  return Array.from(groups.values()).flatMap((group) =>
    stackedTextGroup(group, height)
  )
}

export function renderedTextItemBounds(
  items: SlideshowTextItem[],
  width: number,
  height: number
): SlideshowTextBounds[] {
  return layoutRenderedTextItems(items, width, height).map((rendered) =>
    renderedTextBounds(rendered, width, height)
  )
}

// Editing uses the configured text box width, not only the glyph bounds. This
// makes Width immediately visible and gives the whole wrapping area a stable
// click target while preserving the tight bounds used by layout tests.
export function renderedTextItemEditorBounds(
  items: SlideshowTextItem[],
  width: number,
  height: number
): SlideshowTextBounds[] {
  return layoutRenderedTextItems(items, width, height).map((rendered) => {
    const tight = renderedTextBounds(rendered, width, height)
    const left =
      rendered.item.textAlign === "left"
        ? rendered.x
        : rendered.item.textAlign === "right"
          ? rendered.x - rendered.textBoxWidth
          : rendered.x - rendered.textBoxWidth / 2
    const boundedLeft = Math.max(0, Math.min(width, left))
    return {
      ...tight,
      left: boundedLeft,
      width: Math.max(0, Math.min(rendered.textBoxWidth, width - boundedLeft)),
    }
  })
}

function renderedTextBounds(
  rendered: RenderedTextItem,
  width: number,
  height: number
): SlideshowTextBounds {
  const { item, x, y, fontSize, lineHeight, lines } = rendered
  const strokePadding = needsTextStroke(item.textStyle)
    ? Math.max(6, fontSize * 0.13) / 2
    : 0
  const horizontalPadding = strokePadding + 4
  const verticalPadding = strokePadding + 3
  const textWidth = Math.max(
    fontSize * 0.55,
    ...lines.map((line) => textDisplayUnits(line) * fontSize)
  )
  const firstLineTop = y - fontSize * 0.52
  const lastLineBottom =
    y + Math.max(0, lines.length - 1) * lineHeight + fontSize * 0.52
  const left =
    item.textAlign === "left"
      ? x
      : item.textAlign === "right"
        ? x - textWidth
        : x - textWidth / 2

  return {
    id: item.id,
    left: Math.max(0, left - horizontalPadding),
    top: Math.max(0, firstLineTop - verticalPadding),
    width: Math.min(width, textWidth + horizontalPadding * 2),
    height: Math.min(
      height,
      lastLineBottom - firstLineTop + verticalPadding * 2
    ),
  }
}

function prepareRenderedTextItem(
  item: SlideshowTextItem,
  width: number,
  height: number
): RenderedTextItem {
  const fontSize = Math.max(32, Math.min(96, parseFontSize(item.fontSize) * 4))
  const textBoxWidth = textItemPixelWidth(item, width)
  const x = textItemX(item, width, textBoxWidth)
  const lines = wrapText(item.text, Math.max(4, textBoxWidth / fontSize))
  const lineHeight = fontSize * 1.12
  const blockHeight = Math.max(fontSize, lines.length * lineHeight)
  const y = textItemY(item, height, blockHeight)
  return {
    item,
    x,
    y,
    fontSize,
    lineHeight,
    lines,
    blockHeight,
    textBoxWidth,
  }
}

function stackedTextGroup(group: RenderedTextItem[], slideHeight: number) {
  if (group.length <= 1) {
    return group
  }
  if (!hasHorizontalOverlap(group)) {
    return group
  }

  const gap = Math.max(
    20,
    Math.min(...group.map((item) => item.fontSize)) * 1.1
  )
  const totalHeight =
    group.reduce((total, item) => total + item.blockHeight, 0) +
    gap * (group.length - 1)
  const minTop = 20
  const maxTop = Math.max(minTop, slideHeight - totalHeight - 20)
  let cursor = Math.min(
    maxTop,
    Math.max(minTop, group[0].y - group[0].blockHeight / 2)
  )

  return group.map((item) => {
    const y = cursor + item.blockHeight / 2
    cursor += item.blockHeight + gap
    return { ...item, y }
  })
}

function hasHorizontalOverlap(group: RenderedTextItem[]) {
  const ranges = group.map((item) => {
    const left =
      item.item.textAlign === "right"
        ? item.x - item.textBoxWidth
        : item.item.textAlign === "left"
          ? item.x
          : item.x - item.textBoxWidth / 2
    return { left, right: left + item.textBoxWidth }
  })
  return ranges.some((range, index) =>
    ranges
      .slice(index + 1)
      .some((other) => range.left < other.right && other.left < range.right)
  )
}

function renderedTextItemSvg(rendered: RenderedTextItem, font: string) {
  const { item, x, y, fontSize, lineHeight, lines } = rendered
  const textAnchor = svgTextAnchor(item.textAlign)
  const fill = textFill(item.textStyle)
  const stroke = needsTextStroke(item.textStyle)
    ? ` stroke="#000000" stroke-opacity="0.88" stroke-width="${Math.max(6, fontSize * 0.13)}" paint-order="stroke"`
    : ""
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join("")

  const fontFamily = escapeXml(font || defaultSlideshowFont)
  const background = renderedTextBackgroundSvg(rendered)
  return `${background}<text id="${escapeXml(item.id)}" x="${x}" y="${y}" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="${fontFamily}, Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${fill}"${stroke}>${tspans}</text>`
}

function renderedTextBackgroundSvg(rendered: RenderedTextItem) {
  const color = textStyleToEditorColor(rendered.item.textStyle)
  if (!color.endsWith("Background")) return ""

  const paddingX = rendered.fontSize * 0.28
  const paddingY = rendered.fontSize * 0.1
  const height = rendered.fontSize * 1.1 + paddingY * 2
  const fill = color.startsWith("White") ? "#ffffff" : "#111111"
  const opacity = color.includes("50%") ? 0.56 : 0.9

  return rendered.lines
    .map((line, index) => {
      const textWidth = Math.max(
        rendered.fontSize * 0.55,
        textDisplayUnits(line) * rendered.fontSize
      )
      const width = textWidth + paddingX * 2
      const left =
        rendered.item.textAlign === "left"
          ? rendered.x - paddingX
          : rendered.item.textAlign === "right"
            ? rendered.x - textWidth - paddingX
            : rendered.x - width / 2
      const lineY = rendered.y + index * rendered.lineHeight
      const top = lineY - rendered.fontSize * 0.55 - paddingY

      return `<rect data-text-background="${escapeXml(rendered.item.id)}" data-text-background-line="${index}" x="${left}" y="${top}" width="${width}" height="${height}" rx="${Math.max(3, rendered.fontSize * 0.06)}" fill="${fill}" fill-opacity="${opacity}"/>`
    })
    .join("")
}

function textItemY(
  item: SlideshowTextItem,
  slideHeight: number,
  blockHeight: number
) {
  const safeMargin =
    item.textVerticalAnchor === "flush"
      ? Math.max(20, slideHeight * 0.05)
      : Math.max(32, slideHeight * 0.16)
  if (item.textPlacement === "top") {
    return Math.round(safeMargin)
  }
  if (item.textPlacement === "bottom") {
    return Math.round(Math.max(safeMargin, slideHeight - safeMargin))
  }
  if (item.textPlacement === "center") {
    return Math.round(slideHeight * 0.45)
  }
  const raw = clampPercent(item.textPosition.y) * slideHeight
  const min = Math.max(20, blockHeight / 2 + 20)
  const max = Math.max(min, slideHeight - blockHeight / 2 - 20)
  return Math.round(Math.min(max, Math.max(min, raw)))
}

function textItemX(
  item: SlideshowTextItem,
  slideWidth: number,
  textBoxWidth: number
) {
  const safeMargin =
    item.textAnchor === "flush"
      ? Math.max(8, slideWidth * 0.015)
      : Math.max(20, slideWidth * 0.1)
  const raw = clampPercent(item.textPosition.x) * slideWidth
  if (item.textAlign === "left") {
    const max = Math.max(safeMargin, slideWidth - textBoxWidth - safeMargin)
    return Math.round(Math.min(max, Math.max(safeMargin, raw)))
  }
  if (item.textAlign === "right") {
    const min = Math.min(slideWidth - safeMargin, textBoxWidth + safeMargin)
    return Math.round(Math.min(slideWidth - safeMargin, Math.max(min, raw)))
  }
  const min = Math.min(slideWidth - safeMargin, textBoxWidth / 2 + safeMargin)
  const max = Math.max(min, slideWidth - textBoxWidth / 2 - safeMargin)
  return Math.round(Math.min(max, Math.max(min, raw)))
}

function textItemPixelWidth(item: SlideshowTextItem, slideWidth: number) {
  return Math.round(
    Math.max(10, Math.min(100, item.textSize.width)) * 0.01 * slideWidth
  )
}

function parseFontSize(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12
}

function clampPercent(value: number) {
  const normalized = Number.isFinite(value) ? value : 50
  return Math.min(1, Math.max(0, normalized / 100))
}

function svgTextAnchor(value: string | undefined) {
  if (value === "left") return "start"
  if (value === "right") return "end"
  return "middle"
}

function textFill(style: string) {
  const editorColor = textStyleToEditorColor(style)
  if (editorColor === "Yellow Text") return "#fff176"
  if (editorColor === "Black Text" || editorColor === "White Background")
    return "#111111"
  return "#ffffff"
}

function needsTextStroke(style: string) {
  return textStyleUsesStroke(style)
}

function wrapText(text: string, maxLineUnits: number) {
  const tokens = textWrapTokens(clean(text))
  if (tokens.length === 0) {
    return [""]
  }

  const lines: string[] = []
  let current = ""

  for (const token of tokens) {
    const next = current ? `${current}${token}` : token.trimStart()
    if (textDisplayUnits(next) > maxLineUnits && current) {
      lines.push(current)
      current = token.trimStart()
      continue
    }
    if (textDisplayUnits(next) > maxLineUnits) {
      const chunks = chunkLongTextToken(next, maxLineUnits)
      lines.push(...chunks.slice(0, -1))
      current = chunks.at(-1) ?? ""
    } else {
      current = next
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines
}

function textWrapTokens(text: string) {
  const words = text.match(/\s*\S+/gu) ?? []
  return words.flatMap((word) =>
    textDisplayUnits(word.trim()) > 16 && containsUnspacedScript(word)
      ? Array.from(word)
      : [word]
  )
}

function chunkLongTextToken(token: string, maxLineUnits: number) {
  const chunks: string[] = []
  let current = ""

  for (const character of Array.from(token)) {
    const next = `${current}${character}`
    if (textDisplayUnits(next) > maxLineUnits && current) {
      chunks.push(current)
      current = character.trimStart()
    } else {
      current = next
    }
  }
  if (current) {
    chunks.push(current)
  }
  return chunks
}

function textDisplayUnits(text: string) {
  return Array.from(text).reduce((total, character) => {
    if (containsUnspacedScript(character)) return total + 1
    return total + (character.charCodeAt(0) > 255 ? 1.2 : 0.55)
  }, 0)
}

function containsUnspacedScript(text: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    text
  )
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
