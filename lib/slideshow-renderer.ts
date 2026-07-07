import { clean } from "@/lib/guards"
import { textStyleToEditorColor } from "@/lib/realfarm-slideshow-text-style-config"

export type SlideshowTextItem = {
  id: string
  text: string
  font: string
  fontSize: string
  textSize: {
    width: number
    height: number
  }
  textStyle: string
  textAlign?: string
  textAnchor?: string
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

export type SlideshowSlide = {
  id: string
  image_url: string
  source_image_url?: string
  overlayImage?: SlideshowOverlayImage
  textItems: SlideshowTextItem[]
  aspect_ratio: string
  time_length_ms: number
}

export function renderedSlideSvg(
  slide: SlideshowSlide,
  sourceUrl: string,
  overlayUrl?: string
) {
  const { width, height } = slideDimensions(slide.aspect_ratio)
  const textItems = slide.textItems
  const overlayImageSvg =
    slide.overlayImage && overlayUrl
      ? renderedOverlayImageSvg(slide.overlayImage, overlayUrl, width, height)
      : null

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#111"/>`,
    `<image href="${escapeXml(sourceUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`,
    `<rect width="${width}" height="${height}" fill="#000" opacity="0.08"/>`,
    overlayImageSvg,
    ...renderedTextItemsSvg(textItems, width, height),
    `</svg>`,
  ]
    .filter(Boolean)
    .join("")
}

export function slideDimensions(aspectRatio: string) {
  switch (aspectRatio) {
    case "4:5":
      return { width: 1080, height: 1350 }
    case "1:1":
      return { width: 1080, height: 1080 }
    case "fit":
      return { width: 1080, height: 1080 }
    case "9:16":
    default:
      return { width: 1080, height: 1920 }
  }
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
}

function renderedTextItemsSvg(
  items: SlideshowTextItem[],
  width: number,
  height: number
) {
  const groups = new Map<string, RenderedTextItem[]>()

  for (const item of items) {
    const prepared = prepareRenderedTextItem(item, width, height)
    const key = [
      Math.round(item.textPosition.x),
      Math.round(item.textPosition.y),
      item.textAlign || "center",
    ].join(":")
    groups.set(key, [...(groups.get(key) ?? []), prepared])
  }

  return Array.from(groups.values()).flatMap((group) =>
    stackedTextGroup(group, height).map(renderedTextItemSvg)
  )
}

function prepareRenderedTextItem(
  item: SlideshowTextItem,
  width: number,
  height: number
): RenderedTextItem {
  const fontSize = Math.max(32, Math.min(96, parseFontSize(item.fontSize) * 4))
  const x = clampPercent(item.textPosition.x) * width
  const y = clampPercent(item.textPosition.y) * height
  const textBoxWidth = textItemPixelWidth(item, width)
  const lines = wrapText(item.text, Math.max(4, textBoxWidth / fontSize))
  const lineHeight = fontSize * 1.12
  return {
    item,
    x,
    y,
    fontSize,
    lineHeight,
    lines,
    blockHeight: Math.max(fontSize, lines.length * lineHeight),
  }
}

function stackedTextGroup(group: RenderedTextItem[], slideHeight: number) {
  if (group.length <= 1) {
    return group
  }

  const gap = Math.max(
    10,
    Math.min(...group.map((item) => item.fontSize)) * 0.35
  )
  const totalHeight =
    group.reduce((total, item) => total + item.blockHeight, 0) +
    gap * (group.length - 1)
  const midpoint = group[0].y
  const minTop = 20
  const maxTop = Math.max(minTop, slideHeight - totalHeight - 20)
  let cursor = Math.min(maxTop, Math.max(minTop, midpoint - totalHeight / 2))

  return group.map((item) => {
    const y = cursor + item.blockHeight / 2
    cursor += item.blockHeight + gap
    return { ...item, y }
  })
}

function renderedTextItemSvg(rendered: RenderedTextItem) {
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

  return `<text x="${x}" y="${y}" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${fill}"${stroke}>${tspans}</text>`
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
  return Math.min(0.95, Math.max(0.05, normalized / 100))
}

function svgTextAnchor(value: string | undefined) {
  if (value === "left") return "start"
  if (value === "right") return "end"
  return "middle"
}

function textFill(style: string) {
  const editorColor = textStyleToEditorColor(style)
  if (editorColor === "Yellow Text") return "#fff176"
  if (editorColor === "Black Text") return "#111111"
  return "#ffffff"
}

function needsTextStroke(style: string) {
  return textStyleToEditorColor(style) !== "Black Text"
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

