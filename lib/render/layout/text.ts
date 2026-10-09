/**
 * Text layout (doc 01 §2.3 "Text"): styled runs → measured greedy wrapping →
 * auto-fit font size → overflow policy → positioned glyph runs and
 * line/block backgrounds. Pure: depends only on a TextMeasurer.
 */
import type { TextBackgroundPaint, TextRunPaint } from "../display-list"
import { canvasFont, hasFallbackGlyphs, selectFontFace, type SelectedFace } from "../fonts"
import type { ResolvedTextLayer, ResolvedTextStyle, ResolvedTextStylePatch, SpecIssueCode } from "../spec"
import type { TextMeasurer } from "./measure"

export type TextLayoutInput = {
  layer: ResolvedTextLayer
  /** Fixed box width, or null for "auto" (shrink-wrap up to `maxWidth`). */
  width: number | null
  maxWidth: number
  /** Fixed box height, or null for "auto" (content height). */
  height: number | null
}

export type TextLayoutIssue = { code: SpecIssueCode; message: string; severity: "error" | "warning" }

export type TextLayoutResult = {
  width: number
  height: number
  /** The chosen base font size in px. */
  fontSize: number
  lineCount: number
  runs: TextRunPaint[]
  backgrounds: TextBackgroundPaint[]
  clipToBox: boolean
  issues: TextLayoutIssue[]
}

// ───────────────────────────── styled segments ─────────────────────────────

type Segment = { text: string; style: ResolvedTextStyle; explicitSize?: number }

/** `*word*` → emphasis; `\*` is a literal asterisk. */
export function parseEmphasis(text: string): { text: string; emphasis: boolean }[] {
  const out: { text: string; emphasis: boolean }[] = []
  let buf = ""
  let emphasis = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\" && text[i + 1] === "*") {
      buf += "*"
      i++
      continue
    }
    if (ch === "*") {
      if (buf) out.push({ text: buf, emphasis })
      buf = ""
      emphasis = !emphasis
      continue
    }
    buf += ch
  }
  if (buf) out.push({ text: buf, emphasis })
  return out
}

function mergeStyle(base: ResolvedTextStyle, patch: ResolvedTextStylePatch | undefined): ResolvedTextStyle {
  if (!patch) return base
  return { ...base, ...patch } as ResolvedTextStyle
}

function buildSegments(layer: ResolvedTextLayer): Segment[] {
  const base = layer.style
  const raw: { text: string; patch?: ResolvedTextStylePatch }[] = []
  if (typeof layer.text === "string") {
    if (layer.markup === "emphasis") {
      for (const part of parseEmphasis(layer.text)) {
        raw.push({ text: part.text, patch: part.emphasis ? (layer.emphasisStyle ?? {}) : undefined })
      }
    } else {
      raw.push({ text: layer.text })
    }
  } else {
    for (const span of layer.text) raw.push({ text: span.text, patch: span.style })
  }
  let atWordStart = true
  return raw
    .filter((r) => r.text.length > 0)
    .map((r) => {
      const style = mergeStyle(base, r.patch)
      const explicitSize = typeof r.patch?.fontSize === "number" ? r.patch.fontSize : undefined
      let text = r.text.replace(/\r\n?/g, "\n")
      switch (style.textTransform) {
        case "uppercase":
          text = text.toUpperCase()
          break
        case "lowercase":
          text = text.toLowerCase()
          break
        case "capitalize": {
          let out = ""
          for (const ch of text) {
            out += atWordStart ? ch.toUpperCase() : ch
            atWordStart = /\s/.test(ch)
          }
          text = out
          return { text, style, explicitSize }
        }
      }
      atWordStart = /\s$/.test(text)
      return { text, style, explicitSize }
    })
}

// ───────────────────────────── tokens & clusters ─────────────────────────────

const CJK_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-￯]/

let segmenter: Intl.Segmenter | null | undefined
function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null
  }
  if (!segmenter) return Array.from(text)
  return Array.from(segmenter.segment(text), (s) => s.segment)
}

type Piece = { seg: number; text: string }
type Token =
  | { kind: "break" }
  | { kind: "space"; piece: Piece }
  | { kind: "word"; piece: Piece; breakBefore: boolean }

function tokenize(segments: Segment[], wrap: ResolvedTextStyle["wrap"]): Token[] {
  const tokens: Token[] = []
  let afterSpace = true
  segments.forEach((segment, seg) => {
    for (const part of segment.text.split(/(\n|[^\S\n]+)/)) {
      if (!part) continue
      if (part === "\n") {
        tokens.push({ kind: "break" })
        afterSpace = true
        continue
      }
      if (/^\s+$/.test(part)) {
        tokens.push({ kind: "space", piece: { seg, text: part } })
        afterSpace = true
        continue
      }
      if (wrap === "char") {
        graphemes(part).forEach((g) => tokens.push({ kind: "word", piece: { seg, text: g }, breakBefore: true }))
        afterSpace = false
        continue
      }
      // Words; CJK characters are individual break opportunities.
      let chunk = ""
      let chunkBreak = afterSpace
      const flush = () => {
        if (!chunk) return
        tokens.push({ kind: "word", piece: { seg, text: chunk }, breakBefore: chunkBreak })
        chunk = ""
      }
      for (const g of graphemes(part)) {
        if (CJK_RE.test(g)) {
          flush()
          tokens.push({ kind: "word", piece: { seg, text: g }, breakBefore: true })
          chunkBreak = true
        } else {
          chunk += g
        }
      }
      flush()
      afterSpace = false
    }
  })
  if (wrap === "none") {
    for (const t of tokens) if (t.kind === "word") t.breakBefore = false
  }
  return tokens
}

type MeasuredPiece = Piece & { width: number; space: boolean }
type Cluster = { spaceBefore: MeasuredPiece[]; parts: MeasuredPiece[]; width: number; spaceWidth: number }
type LineItem = MeasuredPiece
type Line = { items: LineItem[]; width: number; hard: boolean }

// ───────────────────────────── layout core ─────────────────────────────

type Sized = {
  faces: SelectedFace[]
  sizes: number[]
  letterSpacing: number[]
}

function sizeSegments(segments: Segment[], baseSize: number, baseRef: number): Sized {
  const faces: SelectedFace[] = []
  const sizes: number[] = []
  const letterSpacing: number[] = []
  for (const s of segments) {
    faces.push(
      selectFontFace(s.style.fontFamily, s.style.fontWeight, s.style.fontStyle) ??
        selectFontFace("Inter", s.style.fontWeight, s.style.fontStyle)!
    )
    sizes.push(s.explicitSize !== undefined ? (s.explicitSize * baseSize) / baseRef : baseSize)
    letterSpacing.push(s.style.letterSpacing ?? 0)
  }
  return { faces, sizes, letterSpacing }
}

function pieceWidth(m: TextMeasurer, sized: Sized, piece: Piece): number {
  const face = sized.faces[piece.seg]
  const size = sized.sizes[piece.seg]
  const ls = sized.letterSpacing[piece.seg]
  if (ls === 0) return m.width(face, size, piece.text)
  let w = 0
  for (const g of graphemes(piece.text)) w += m.width(face, size, g) + ls
  return w
}

function breakLines(tokens: Token[], m: TextMeasurer, sized: Sized, maxWidth: number, wrap: ResolvedTextStyle["wrap"]): Line[] {
  const measure = (p: Piece, space: boolean): MeasuredPiece => ({ ...p, width: pieceWidth(m, sized, p), space })
  // Group into unbreakable clusters separated by spaces / break opportunities.
  const paragraphs: Cluster[][] = [[]]
  let pendingSpace: MeasuredPiece[] = []
  for (const t of tokens) {
    const para = paragraphs[paragraphs.length - 1]
    if (t.kind === "break") {
      paragraphs.push([])
      pendingSpace = []
      continue
    }
    if (t.kind === "space") {
      pendingSpace.push(measure(t.piece, true))
      continue
    }
    const piece = measure(t.piece, false)
    const last = para[para.length - 1]
    if (last && !t.breakBefore && pendingSpace.length === 0) {
      last.parts.push(piece)
      last.width += piece.width
      continue
    }
    para.push({
      spaceBefore: pendingSpace,
      parts: [piece],
      width: piece.width,
      spaceWidth: pendingSpace.reduce((n, p) => n + p.width, 0),
    })
    pendingSpace = []
  }

  const lines: Line[] = []
  const limit = wrap === "none" ? Number.POSITIVE_INFINITY : Math.max(1, maxWidth)
  paragraphs.forEach((clusters, pi) => {
    const hard = pi < paragraphs.length - 1
    let line: Line = { items: [], width: 0, hard: false }
    const push = () => {
      lines.push(line)
      line = { items: [], width: 0, hard: false }
    }
    for (const cluster of clusters) {
      const empty = line.items.length === 0
      const needed = (empty ? 0 : cluster.spaceWidth) + cluster.width
      if (!empty && line.width + needed > limit + 0.01) push()
      if (line.items.length === 0 && cluster.width > limit + 0.01) {
        // Unbreakable cluster wider than the line: fall back to char breaking.
        for (const part of cluster.parts) {
          for (const g of graphemes(part.text)) {
            const gp = measure({ seg: part.seg, text: g }, false)
            if (line.items.length > 0 && line.width + gp.width > limit + 0.01) push()
            appendItem(line, gp)
          }
        }
        continue
      }
      if (line.items.length > 0) for (const s of cluster.spaceBefore) appendItem(line, s)
      for (const p of cluster.parts) appendItem(line, p)
    }
    line.hard = hard
    lines.push(line)
  })
  for (const l of lines) trimTrailingSpaces(l)
  return lines
}

function appendItem(line: Line, item: MeasuredPiece): void {
  const prev = line.items[line.items.length - 1]
  if (prev && prev.seg === item.seg && prev.space === item.space) {
    prev.text += item.text
    prev.width += item.width
  } else {
    line.items.push({ ...item })
  }
  line.width += item.width
}

function trimTrailingSpaces(line: Line): void {
  while (line.items.length && line.items[line.items.length - 1].space) {
    const s = line.items.pop()!
    line.width -= s.width
  }
}

type LineMetrics = { box: number; ascent: number; descent: number; size: number }

function lineMetrics(line: Line, m: TextMeasurer, sized: Sized, baseSize: number, lineHeight: number): LineMetrics {
  let size = 0
  let ascent = 0
  let descent = 0
  const segs = line.items.length ? line.items.map((i) => i.seg) : [0]
  for (const seg of segs) {
    const s = sized.sizes[seg] ?? baseSize
    const fm = m.metrics(sized.faces[seg] ?? sized.faces[0])
    size = Math.max(size, s)
    ascent = Math.max(ascent, fm.ascent * s)
    descent = Math.max(descent, fm.descent * s)
  }
  if (size === 0) size = baseSize
  return { box: lineHeight * size, ascent, descent, size }
}

type Attempt = {
  size: number
  lines: Line[]
  metrics: LineMetrics[]
  textHeight: number
  maxLineWidth: number
  fits: boolean
  sized: Sized
}

export function layoutText(input: TextLayoutInput, measurer: TextMeasurer): TextLayoutResult {
  const { layer } = input
  const style = layer.style
  const segments = buildSegments(layer)
  const issues: TextLayoutIssue[] = []
  const allText = segments.map((s) => s.text).join("")
  if (hasFallbackGlyphs(allText)) {
    issues.push({
      code: "font.fallback_glyphs",
      severity: "warning",
      message: `Text in layer "${layer.id}" uses characters (emoji or non-Latin scripts) that ${style.fontFamily} does not contain; they render with a fallback font.`,
    })
  }
  const range = typeof style.fontSize === "number" ? { min: style.fontSize, max: style.fontSize } : style.fontSize
  const baseRef = range.max
  const bg = style.background
  const padFor = (size: number) => ({
    x: bg ? (bg.paddingX ?? 0.28 * size) : 0,
    y: bg ? (bg.paddingY ?? 0.1 * size) : 0,
  })
  const tokens = tokenize(segments, style.wrap)

  const attempt = (size: number): Attempt => {
    const sized = sizeSegments(segments, size, baseRef)
    const pad = padFor(size)
    const outerW = input.width ?? input.maxWidth
    const avail = Math.max(1, outerW - 2 * pad.x)
    const lines = breakLines(tokens, measurer, sized, avail, style.wrap)
    const metrics = lines.map((l) => lineMetrics(l, measurer, sized, size, style.lineHeight))
    const textHeight = metrics.reduce((n, lm) => n + lm.box, 0)
    const maxLineWidth = lines.reduce((n, l) => Math.max(n, l.width), 0)
    let fits = true
    if (style.maxLines !== undefined && lines.length > style.maxLines) fits = false
    if (input.height !== null && textHeight + 2 * pad.y > input.height + 0.5) fits = false
    if (maxLineWidth > avail + 0.5) fits = false
    return { size, lines, metrics, textHeight, maxLineWidth, fits, sized }
  }

  // Auto-fit: largest integer px in [min, max] that fits (binary search).
  let chosen: Attempt | null = null
  const lo = Math.ceil(range.min)
  const hi = Math.floor(range.max)
  if (range.min === range.max || hi < lo) {
    const a = attempt(range.max)
    if (a.fits) chosen = a
  } else {
    const top = attempt(hi)
    if (top.fits) chosen = top
    else {
      let low = lo
      let high = hi - 1
      let best: Attempt | null = null
      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        const a = attempt(mid)
        if (a.fits) {
          best = a
          low = mid + 1
        } else high = mid - 1
      }
      chosen = best
    }
  }

  let clipToBox = false
  let ellipsize = false
  if (!chosen) {
    const atMin = attempt(range.min)
    chosen = atMin
    switch (style.overflow) {
      case "error":
        issues.push({
          code: "text.overflow",
          severity: "error",
          message: `Text in layer "${layer.id}" does not fit its box at ${round(range.min)}px (${atMin.lines.length} lines${style.maxLines !== undefined ? `, maxLines ${style.maxLines}` : ""}).`,
        })
        break
      case "shrink":
        issues.push({
          code: "text.shrunk_below_min",
          severity: "warning",
          message: `Text in layer "${layer.id}" clipped at ${round(range.min)}px; ${atMin.lines.length} lines${style.maxLines !== undefined ? ` exceed maxLines ${style.maxLines}` : " exceed the box"}.`,
        })
        clipToBox = true
        break
      case "ellipsis":
        ellipsize = true
        break
      case "clip":
        clipToBox = true
        break
    }
  }

  const size = chosen.size
  const pad = padFor(size)
  let lines = chosen.lines
  let metrics = chosen.metrics
  const sized = chosen.sized
  const outerW = input.width ?? input.maxWidth
  const avail = Math.max(1, outerW - 2 * pad.x)

  // Truncate to maxLines / height for clip & ellipsis.
  if (clipToBox || ellipsize) {
    let keep = lines.length
    if (style.maxLines !== undefined) keep = Math.min(keep, style.maxLines)
    if (input.height !== null) {
      let h = 2 * pad.y
      let n = 0
      for (const lm of metrics) {
        if (h + lm.box > input.height + 0.5) break
        h += lm.box
        n++
      }
      keep = Math.min(keep, Math.max(1, n))
    }
    const truncated = keep < lines.length
    lines = lines.slice(0, keep)
    metrics = metrics.slice(0, keep)
    if (ellipsize && truncated && lines.length) {
      lines[lines.length - 1] = ellipsizeLine(lines[lines.length - 1], measurer, sized, avail)
    }
  }

  const textHeight = metrics.reduce((n, lm) => n + lm.box, 0)
  const maxLineWidth = lines.reduce((n, l) => Math.max(n, l.width), 0)
  const boxWidth = input.width ?? Math.min(input.maxWidth, maxLineWidth + 2 * pad.x)
  const boxHeight = input.height ?? textHeight + 2 * pad.y
  const contentW = Math.max(0, boxWidth - 2 * pad.x)
  const contentH = Math.max(0, boxHeight - 2 * pad.y)
  let offsetY = 0
  if (textHeight < contentH) {
    if (style.verticalAlign === "middle") offsetY = (contentH - textHeight) / 2
    else if (style.verticalAlign === "bottom") offsetY = contentH - textHeight
  }

  const runs: TextRunPaint[] = []
  const backgrounds: TextBackgroundPaint[] = []
  const lineBoxes: { left: number; right: number; top: number; bottom: number; ascent: number; descent: number; baseline: number }[] = []
  let cursorY = pad.y + offsetY
  lines.forEach((line, li) => {
    const lm = metrics[li]
    const baseline = cursorY + (lm.box - (lm.ascent + lm.descent)) / 2 + lm.ascent
    const isLast = li === lines.length - 1
    const justify = style.align === "justify" && !isLast && !line.hard
    const spaces = line.items.filter((i) => i.space).length
    const extra = justify && spaces > 0 ? (contentW - line.width) / spaces : 0
    let x = pad.x
    if (!justify) {
      if (style.align === "center") x += (contentW - line.width) / 2
      else if (style.align === "right") x += contentW - line.width
    }
    const left = x
    for (const item of line.items) {
      if (item.space) {
        x += item.width + extra
        continue
      }
      const seg = segments[item.seg]
      const face = sized.faces[item.seg]
      const fs = sized.sizes[item.seg]
      const ls = sized.letterSpacing[item.seg]
      const run: TextRunPaint = {
        text: item.text,
        x,
        baseline,
        width: item.width,
        font: canvasFont(face, fs),
        fontSize: fs,
        fill: seg.style.color,
        ...(seg.style.stroke && seg.style.stroke.width > 0 ? { stroke: seg.style.stroke } : {}),
        ...(seg.style.shadow ? { shadow: seg.style.shadow } : {}),
        underline: seg.style.underline,
        syntheticItalic: face.syntheticItalic,
      }
      if (ls !== 0) {
        let dx = 0
        run.glyphs = graphemes(item.text).map((g) => {
          const at = dx
          dx += measurer.width(face, fs, g) + ls
          return { text: g, dx: at }
        })
      }
      runs.push(run)
      x += item.width
    }
    lineBoxes.push({
      left,
      right: justify ? pad.x + contentW : left + line.width,
      top: cursorY,
      bottom: cursorY + lm.box,
      ascent: lm.ascent,
      descent: lm.descent,
      baseline,
    })
    cursorY += lm.box
  })

  if (bg) {
    const radius = bg.radius ?? 0
    const opacity = bg.opacity ?? 1
    if (bg.mode === "lines") {
      lineBoxes.forEach((lb, i) => {
        if (lines[i].items.length === 0) return
        backgrounds.push({
          x: lb.left - pad.x,
          y: lb.baseline - lb.ascent - pad.y,
          width: lb.right - lb.left + 2 * pad.x,
          height: lb.ascent + lb.descent + 2 * pad.y,
          radius,
          color: bg.color,
          opacity,
        })
      })
    } else if (lines.some((l) => l.items.length > 0)) {
      const left = Math.min(...lineBoxes.map((l) => l.left))
      const right = Math.max(...lineBoxes.map((l) => l.right))
      const top = lineBoxes[0].top
      const bottom = lineBoxes[lineBoxes.length - 1].bottom
      backgrounds.push({
        x: left - pad.x,
        y: top - pad.y,
        width: right - left + 2 * pad.x,
        height: bottom - top + 2 * pad.y,
        radius,
        color: bg.color,
        opacity,
      })
    }
  }

  return {
    width: boxWidth,
    height: boxHeight,
    fontSize: size,
    lineCount: lines.length,
    runs,
    backgrounds,
    clipToBox: clipToBox || (input.height !== null && textHeight + 2 * pad.y > input.height + 0.5),
    issues,
  }
}

function ellipsizeLine(line: Line, m: TextMeasurer, sized: Sized, maxWidth: number): Line {
  const items = line.items.map((i) => ({ ...i }))
  const lastSeg = items.length ? items[items.length - 1].seg : 0
  const ellipsis = { seg: lastSeg, text: "…" }
  const ellW = pieceWidth(m, sized, ellipsis)
  let width = items.reduce((n, i) => n + i.width, 0)
  while (items.length && width + ellW > maxWidth + 0.01) {
    const last = items[items.length - 1]
    const gs = graphemes(last.text)
    gs.pop()
    if (gs.length === 0 || last.space) {
      items.pop()
    } else {
      last.text = gs.join("")
      last.width = pieceWidth(m, sized, last)
    }
    width = items.reduce((n, i) => n + i.width, 0)
  }
  while (items.length && items[items.length - 1].space) items.pop()
  width = items.reduce((n, i) => n + i.width, 0)
  const tail = items[items.length - 1]
  if (tail && tail.seg === ellipsis.seg) {
    tail.text += "…"
    tail.width += ellW
  } else {
    items.push({ ...ellipsis, width: ellW, space: false })
  }
  return { items, width: width + ellW, hard: line.hard }
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
