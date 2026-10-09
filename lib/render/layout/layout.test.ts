import { describe, expect, it } from "vitest"

import type { DisplayNode, GroupNode, ImageNode } from "../display-list"
import { TEXT_STYLE_DEFAULTS, type ResolvedLayer, type ResolvedSlide, type ResolvedTextStyle } from "../spec"
import { anchorFactors, frameSize, placeFrame, resolveInsets, resolveLength } from "./frame"
import { fitImage } from "./image"
import { layoutSlide } from "./layout"
import { createFixedMeasurer } from "./measure"

const env = {
  measurer: createFixedMeasurer(0.5),
  imageSize: (key: string) => (key === "media:wide" ? { width: 2000, height: 1000 } : key === "media:tall" ? { width: 500, height: 1000 } : null),
}

const style = (s: Partial<ResolvedTextStyle> = {}): ResolvedTextStyle =>
  ({ ...TEXT_STYLE_DEFAULTS, overflow: "error", fontSize: 20, ...s }) as ResolvedTextStyle

function slide(layers: ResolvedLayer[]): ResolvedSlide {
  return { id: "s", background: "#000000", layers }
}

const run = (layers: ResolvedLayer[], size = { width: 1000, height: 2000 }) => layoutSlide(slide(layers), 0, size, env)

describe("frame", () => {
  it("resolves lengths, insets and anchors", () => {
    expect(resolveLength("50%", 400)).toBe(200)
    expect(resolveLength(12, 400)).toBe(12)
    expect(resolveInsets(["10%", 5, "10%", 5], 100, 200)).toEqual([20, 5, 20, 5])
    expect(anchorFactors("bottom-right")).toEqual({ ax: 1, ay: 1 })
    expect(frameSize({ width: "auto" }, 100, 100)).toEqual({ width: null, height: 100 })
    expect(frameSize(undefined, 100, 50, { height: true })).toEqual({ width: 100, height: null })
    expect(placeFrame({ x: "50%", y: "100%", anchor: "bottom" }, 1000, 2000, 200, 100)).toEqual({ x: 400, y: 1900, width: 200, height: 100 })
    expect(placeFrame({ inset: 24 }, 1000, 2000, 952, 1952)).toEqual({ x: 24, y: 24, width: 952, height: 1952 })
  })
})

describe("fitImage", () => {
  it("covers around the focal point and clamps to the image edge", () => {
    const centred = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, "cover")
    expect(centred).toMatchObject({ sx: 500, sy: 0, sw: 1000, sh: 1000, dx: 0, dy: 0, dw: 500, dh: 500, scale: 0.5 })
    const left = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, "cover", { x: 0, y: 0.5 })
    expect(left.sx).toBe(0)
    const right = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, "cover", { x: 1, y: 0.5 })
    expect(right.sx).toBe(1000)
  })

  it("contains with letterbox, fills by stretching, and zooms", () => {
    const contain = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, "contain")
    expect(contain).toMatchObject({ dx: 0, dy: 125, dw: 500, dh: 250, sw: 2000, sh: 1000 })
    const fill = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, "fill")
    expect(fill).toMatchObject({ dx: 0, dy: 0, dw: 500, dh: 500, sw: 2000, sh: 1000 })
    const zoom = fitImage({ width: 1000, height: 1000 }, { width: 500, height: 500 }, "cover", { x: 0.5, y: 0.5 }, 2)
    expect(zoom).toMatchObject({ sx: 250, sy: 250, sw: 500, sh: 500 })
    const none = fitImage({ width: 100, height: 100 }, { width: 500, height: 500 }, "none")
    expect(none).toMatchObject({ dx: 200, dy: 200, dw: 100, dh: 100 })
  })
})

describe("layoutSlide", () => {
  it("places absolute layers, sorts by z, and sizes auto text", () => {
    const { slide: s, errors } = run([
      { id: "a", type: "shape", shape: "rect", opacity: 1, rotation: 0, z: 2, frame: { inset: 0 }, fill: "#FFFFFF" },
      { id: "b", type: "text", opacity: 1, rotation: 0, text: "abcd", markup: "none", style: style(), frame: { x: "50%", y: 100, width: "auto", anchor: "top" } },
    ])
    expect(errors).toEqual([])
    expect(s.nodes.map((n) => n.id)).toEqual(["b", "a"])
    const text = s.nodes[0]
    expect(text.box).toEqual({ x: 480, y: 100, width: 40, height: 23 })
  })

  it("stacks children and grows an auto-height group upward from a bottom anchor", () => {
    const { slide: s } = run([
      {
        id: "copy",
        type: "group",
        opacity: 1,
        rotation: 0,
        layout: { type: "stack", direction: "vertical", gap: 10, align: "start" },
        frame: { x: 100, y: 1900, width: 800, height: "auto", anchor: "bottom-left" },
        children: [
          { id: "t1", type: "text", opacity: 1, rotation: 0, text: "one", markup: "none", style: style() },
          { id: "t2", type: "text", opacity: 1, rotation: 0, text: "two", markup: "none", style: style({ fontSize: 40 }) },
        ],
      },
    ])
    const group = s.nodes[0] as GroupNode
    // 23 + 10 + 46
    expect(group.box).toEqual({ x: 100, y: 1900 - 79, width: 800, height: 79 })
    expect(group.children.map((c) => c.box.y)).toEqual([0, 33])
  })

  it("fills grid cells row-major and ignores child frames", () => {
    const cell = (id: string, media: string): ResolvedLayer => ({
      id,
      type: "image",
      opacity: 1,
      rotation: 0,
      src: { media },
      fit: "cover",
      focal: { x: 0.5, y: 0.5 },
      zoom: 1,
      frame: { x: 999, y: 999 },
    })
    const { slide: s } = run(
      [
        {
          id: "grid",
          type: "group",
          opacity: 1,
          rotation: 0,
          frame: { inset: 20 },
          layout: { type: "grid", columns: 2, rows: 2, gap: 10 },
          children: [cell("a", "wide"), cell("b", "tall"), cell("c", "wide"), cell("d", "tall")],
        },
      ],
      { width: 1000, height: 1000 }
    )
    const group = s.nodes[0] as GroupNode
    expect(group.children.map((c) => [c.box.x, c.box.y, c.box.width, c.box.height])).toEqual([
      [0, 0, 475, 475],
      [485, 0, 475, 475],
      [0, 485, 475, 475],
      [485, 485, 475, 475],
    ])
    const img = group.children[1] as ImageNode
    expect(img.placement).toMatchObject({ dx: 0, dy: 0, dw: 475, dh: 475 })
  })

  it("derives auto image height from the intrinsic aspect and reports missing images", () => {
    const { slide: s, errors } = run([
      { id: "w", type: "image", opacity: 1, rotation: 0, src: { media: "wide" }, fit: "contain", focal: { x: 0.5, y: 0.5 }, zoom: 1, frame: { width: 500, height: "auto" } },
      { id: "x", type: "image", opacity: 1, rotation: 0, src: { media: "missing" }, fit: "cover", focal: { x: 0.5, y: 0.5 }, zoom: 1 },
    ])
    expect((s.nodes as DisplayNode[]).map((n) => n.box.height)).toEqual([250])
    expect(errors.map((e) => [e.code, e.path, e.slide])).toEqual([["asset.fetch_failed", "/slides/0/layers/1/src", 0]])
  })

  it("reports text overflow errors with a ResolvedSpec path", () => {
    const { errors } = run([
      { id: "t", type: "text", opacity: 1, rotation: 0, text: "x ".repeat(200), markup: "none", style: style({ fontSize: 40, maxLines: 2 }), frame: { width: 100 } },
    ])
    expect(errors.map((e) => [e.code, e.path])).toEqual([["text.overflow", "/slides/0/layers/0"]])
  })
})
