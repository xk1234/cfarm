import { describe, expect, it } from "vitest"

import { TEXT_STYLE_DEFAULTS, type ResolvedTextLayer, type ResolvedTextStyle } from "../spec"
import { createFixedMeasurer } from "./measure"
import { layoutText, parseEmphasis } from "./text"

// Fixed measurer: every character advances 0.5 × fontSize; ascent .8, descent .2.
const m = createFixedMeasurer(0.5)

function layer(text: ResolvedTextLayer["text"], style: Partial<ResolvedTextStyle> = {}, extra: Partial<ResolvedTextLayer> = {}): ResolvedTextLayer {
  const fontSize = style.fontSize ?? 20
  return {
    id: "t",
    type: "text",
    opacity: 1,
    rotation: 0,
    text,
    markup: "none",
    style: {
      ...TEXT_STYLE_DEFAULTS,
      overflow: typeof fontSize === "number" ? "error" : "shrink",
      ...style,
      fontSize,
    } as ResolvedTextStyle,
    ...extra,
  }
}

const lines = (r: ReturnType<typeof layoutText>) => {
  const byBaseline = new Map<number, string[]>()
  for (const run of r.runs) byBaseline.set(run.baseline, [...(byBaseline.get(run.baseline) ?? []), run.text])
  return [...byBaseline.values()].map((parts) => parts.join(" "))
}

describe("parseEmphasis", () => {
  it("splits *emphasis* and honours escapes", () => {
    expect(parseEmphasis("a *b* c")).toEqual([
      { text: "a ", emphasis: false },
      { text: "b", emphasis: true },
      { text: " c", emphasis: false },
    ])
    expect(parseEmphasis("5 \\* 3")).toEqual([{ text: "5 * 3", emphasis: false }])
  })
})

describe("layoutText", () => {
  it("wraps greedily by measured width", () => {
    // 20px font → 10px per char; 100px box fits 10 chars.
    const r = layoutText({ layer: layer("aaaa bbbb cccc dd"), width: 100, maxWidth: 1000, height: null }, m)
    expect(lines(r)).toEqual(["aaaa bbbb", "cccc dd"])
    expect(r.lineCount).toBe(2)
    // line box = 1.15 × 20 = 23
    expect(r.height).toBeCloseTo(46)
    // first baseline: half-leading (23 - 20)/2 + ascent 16
    expect(r.runs[0].baseline).toBeCloseTo(17.5)
  })

  it("honours hard line breaks and breaks long words by character", () => {
    const r = layoutText({ layer: layer("ab\nabcdefghijklmnop"), width: 100, maxWidth: 1000, height: null }, m)
    expect(lines(r).map((l) => l.replace(/ /g, ""))).toEqual(["ab", "abcdefghij", "klmnop"])
  })

  it("breaks CJK text between characters", () => {
    const r = layoutText({ layer: layer("日本語のテキストです"), width: 100, maxWidth: 1000, height: null }, m)
    // wide chars advance 2 × 10px → 5 per line
    expect(r.lineCount).toBe(2)
  })

  it("auto-fits the largest integer size within the range", () => {
    const r = layoutText(
      { layer: layer("hello world", { fontSize: { min: 10, max: 60 }, maxLines: 1 }), width: 200, maxWidth: 1000, height: null },
      m
    )
    // 11 chars × 0.5 × s ≤ 200 → s ≤ 36.36
    expect(r.fontSize).toBe(36)
    expect(r.lineCount).toBe(1)
    expect(r.issues).toEqual([])
  })

  it("fits a fixed box height", () => {
    const r = layoutText(
      { layer: layer("one two three four five six", { fontSize: { min: 10, max: 80 }, lineHeight: 1 }), width: 200, maxWidth: 1000, height: 100 },
      m
    )
    expect(r.height).toBe(100)
    const textHeight = r.lineCount * r.fontSize
    expect(textHeight).toBeLessThanOrEqual(100)
  })

  it("shrinks below min with a warning and clips", () => {
    const r = layoutText(
      { layer: layer("a b c d e f g h", { fontSize: { min: 40, max: 50 }, maxLines: 1 }), width: 100, maxWidth: 1000, height: null },
      m
    )
    expect(r.fontSize).toBe(40)
    expect(r.issues.map((i) => i.code)).toEqual(["text.shrunk_below_min"])
    expect(r.lineCount).toBe(1)
    expect(r.clipToBox).toBe(true)
  })

  it("fails with text.overflow when overflow is error", () => {
    const r = layoutText({ layer: layer("a b c d e f g h", { fontSize: 40, maxLines: 1 }), width: 100, maxWidth: 1000, height: null }, m)
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([["text.overflow", "error"]])
  })

  it("ellipsizes the last kept line", () => {
    const r = layoutText(
      { layer: layer("aaaa bbbb cccc dddd", { fontSize: 20, maxLines: 1, overflow: "ellipsis" }), width: 100, maxWidth: 1000, height: null },
      m
    )
    expect(r.lineCount).toBe(1)
    const text = r.runs.map((x) => x.text).join(" ")
    expect(text.endsWith("…")).toBe(true)
    expect(r.runs.reduce((n, x) => n + x.width, 0)).toBeLessThanOrEqual(100)
  })

  it("aligns lines and justifies all but the last", () => {
    const center = layoutText({ layer: layer("ab", { align: "center" }), width: 100, maxWidth: 1000, height: null }, m)
    expect(center.runs[0].x).toBeCloseTo(40)
    const right = layoutText({ layer: layer("ab", { align: "right" }), width: 100, maxWidth: 1000, height: null }, m)
    expect(right.runs[0].x).toBeCloseTo(80)
    const justify = layoutText({ layer: layer("aa bb cc dd ee", { align: "justify" }), width: 100, maxWidth: 1000, height: null }, m)
    const firstLine = justify.runs.filter((r) => r.baseline === justify.runs[0].baseline)
    const last = firstLine[firstLine.length - 1]
    expect(last.x + last.width).toBeCloseTo(100)
  })

  it("shrink-wraps width: auto", () => {
    const r = layoutText({ layer: layer("abc"), width: null, maxWidth: 500, height: null }, m)
    expect(r.width).toBeCloseTo(30)
  })

  it("applies emphasis styles and text transforms per run", () => {
    const r = layoutText(
      {
        layer: layer("go *now*", { textTransform: "uppercase" }, { markup: "emphasis", emphasisStyle: { color: "#FF0000", fontWeight: 900 } }),
        width: 500,
        maxWidth: 1000,
        height: null,
      },
      m
    )
    expect(r.runs.map((x) => [x.text, x.fill])).toEqual([
      ["GO", "#FFFFFF"],
      ["NOW", "#FF0000"],
    ])
    expect(r.runs[1].font).toContain("900")
  })

  it("keeps glued runs on one line (no break inside a word across spans)", () => {
    const r = layoutText(
      { layer: layer([{ text: "aaaa " }, { text: "bb", style: { color: "#FF0000" } }, { text: "cc" }]), width: 70, maxWidth: 1000, height: null },
      m
    )
    expect(lines(r).map((l) => l.replace(/ /g, ""))).toEqual(["aaaa", "bbcc"])
  })

  it("draws per-line pills inside the frame with default em padding", () => {
    const r = layoutText(
      {
        layer: layer("ab cd", { background: { mode: "lines", color: "#FFFFFF" }, align: "left" }),
        width: 100,
        maxWidth: 1000,
        height: null,
      },
      m
    )
    // padding .28em × .10em at 20px = 5.6 × 2
    expect(r.backgrounds).toHaveLength(1)
    const bg = r.backgrounds[0]
    expect(bg.x).toBeCloseTo(0)
    expect(bg.width).toBeCloseTo(50 + 11.2)
    expect(bg.height).toBeCloseTo(20 + 4)
    expect(r.runs[0].x).toBeCloseTo(5.6)
  })

  it("emits per-glyph offsets for letter spacing", () => {
    const r = layoutText({ layer: layer("abc", { letterSpacing: 4 }), width: 200, maxWidth: 1000, height: null }, m)
    expect(r.runs[0].glyphs?.map((g) => g.dx)).toEqual([0, 14, 28])
    expect(r.runs[0].width).toBeCloseTo(42)
  })

  it("vertically aligns inside a fixed height", () => {
    const r = layoutText({ layer: layer("x", { verticalAlign: "bottom", lineHeight: 1 }), width: 100, maxWidth: 1000, height: 100 }, m)
    // line box 20 at the bottom: baseline = 80 + 16
    expect(r.runs[0].baseline).toBeCloseTo(96)
  })

  it("warns about glyphs no bundled font has", () => {
    const r = layoutText({ layer: layer("hi 👋"), width: 200, maxWidth: 1000, height: null }, m)
    expect(r.issues.map((i) => i.code)).toEqual(["font.fallback_glyphs"])
  })
})
