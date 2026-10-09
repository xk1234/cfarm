import { createHash } from "node:crypto"
import { readdirSync } from "node:fs"
import { join } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import { createMemoryAssetLoader } from "./assets"
import {
  findFontFace,
  listFontFamilies,
  listFonts,
  MIME_BY_FORMAT,
  RenderError,
  renderSpec,
  type FontFaceInfo,
} from "./engine"
import { serverFontFiles } from "./fonts"
import { prepareNodeRenderer } from "./node/platform"
import { zipRenderedSlides } from "./output/zip"
import { resolveTemplate, type ResolvedSpec, type SlideshowSpec } from "./spec"

beforeAll(async () => {
  await prepareNodeRenderer()
})

describe("font registry", () => {
  it("covers every bundled font file exactly once", () => {
    const files = readdirSync(join(process.cwd(), "assets/fonts")).filter((f) => /\.(otf|ttf)$/.test(f))
    expect(listFonts().map((f) => f.file).sort()).toEqual(files.sort())
    expect(files).toHaveLength(22)
  })

  it("exposes families with their real weights", () => {
    expect(listFontFamilies()).toContain("Hertical Serif Regular")
    expect(findFontFace("Inter", 800)?.file).toBe("Inter-Variable.ttf")
    expect(findFontFace("Casual Human", 700)?.file).toBe("CasualHuman-Bold.otf")
    expect(findFontFace("Angelina", 700)).toBeNull()
    expect(findFontFace("Comic Sans")).toBeNull()
  })

  it("registers static Inter instances for every weight on the server", () => {
    const inter = serverFontFiles().filter((f) => f.family === "Inter")
    expect(inter.map((f) => f.weight)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
    for (const f of inter) {
      expect(readdirSync(join(process.cwd(), "assets/fonts/static"))).toContain(f.file.replace("static/", ""))
    }
  })
})

function textSpec(family: string, weight = 400): ResolvedSpec {
  return {
    version: 1,
    canvas: { width: 640, height: 320, background: "#FFFFFF" },
    fonts: [{ family }],
    slides: [
      {
        id: "s",
        background: "#FFFFFF",
        layers: [
          {
            id: "t",
            type: "text",
            opacity: 1,
            rotation: 0,
            text: "Hamburgefonstiv 0123",
            markup: "none",
            frame: { inset: 20 },
            style: {
              fontFamily: family,
              fontWeight: weight,
              fontStyle: "normal",
              fontSize: 56,
              color: "#000000",
              align: "left",
              verticalAlign: "top",
              lineHeight: 1.2,
              letterSpacing: 0,
              textTransform: "none",
              overflow: "clip",
              wrap: "word",
              underline: false,
            },
          },
        ],
      },
    ],
  }
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

describe("renderSpec", () => {
  it("renders every registry family with its own glyphs (no silent Inter fallback)", async () => {
    const faces = new Map<string, FontFaceInfo>()
    for (const f of listFonts()) faces.set(`${f.family}@${f.weights[0]}`, f)
    const hashes = new Map<string, string>()
    for (const [key, face] of faces) {
      const result = await renderSpec(textSpec(face.family, face.weights[0]), { format: "png", scale: 0.5 })
      hashes.set(key, sha(result.slides[0].bytes))
    }
    const inter800 = await renderSpec(textSpec("Inter", 800), { format: "png", scale: 0.5 })
    hashes.set("Inter@800", sha(inter800.slides[0].bytes))
    // 21 families (Casual Human has 2 faces) + Inter 800.
    expect(hashes.size).toBe(23)
    // macOS node-canvas builds draw through Pango's CoreText font map, which
    // does not pick up the three Fontself-built Superbusy faces (they fall
    // back to the system font there). Production renders on Linux, where
    // Pango resolves fonts through fontconfig.
    const distinct = [...hashes.entries()].filter(([key]) => process.platform !== "darwin" || !key.startsWith("Superbusy"))
    expect(new Set(distinct.map(([, h]) => h)).size).toBe(distinct.length)
  })

  it("encodes PNG, JPEG and WebP at the requested scale", async () => {
    const spec = textSpec("Inter", 700)
    for (const format of ["png", "jpeg", "webp"] as const) {
      const result = await renderSpec(spec, { format, scale: 1.5, quality: 0.8 })
      const s = result.slides[0]
      expect(s.mime).toBe(MIME_BY_FORMAT[format])
      expect([s.width, s.height]).toEqual([960, 480])
      expect(s.bytes.byteLength).toBeGreaterThan(500)
    }
    const png = (await renderSpec(spec, { format: "png", scale: 1 })).slides[0].bytes
    expect([...png.subarray(16, 24)]).toEqual([0, 0, 2, 128, 0, 0, 1, 64]) // IHDR 640×320
  })

  it("is deterministic for the same input", async () => {
    const a = await renderSpec(textSpec("Thumpa"), { format: "png", scale: 1 })
    const b = await renderSpec(textSpec("Thumpa"), { format: "png", scale: 1 })
    expect(sha(a.slides[0].bytes)).toBe(sha(b.slides[0].bytes))
  })

  it("renders only the requested slides and validates options", async () => {
    const template: SlideshowSpec = {
      version: 1,
      canvas: { width: 400, height: 400, background: "#123456" },
      slides: [
        { id: "a", layers: [] },
        { id: "b", background: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#000" }, { offset: 1, color: "#FFF" }] }, layers: [] },
      ],
    }
    const resolved = await resolveTemplate(template, {})
    const result = await renderSpec(resolved, { format: "png", scale: 0.5, slides: [1] })
    expect(result.slides.map((s) => [s.index, s.id, s.width])).toEqual([[1, "b", 200]])
    await expect(renderSpec(resolved, { format: "png", scale: 3 })).rejects.toBeInstanceOf(RangeError)
    await expect(renderSpec(resolved, { format: "png", scale: 1, slides: [5] })).rejects.toBeInstanceOf(RangeError)
    const zip = await zipRenderedSlides(result.slides)
    expect(String.fromCharCode(zip[0], zip[1])).toBe("PK")
  })

  it("fails with structured asset and overflow issues", async () => {
    const resolved = await resolveTemplate(
      {
        version: 1,
        canvas: { width: 400, height: 400 },
        slides: [
          {
            id: "s",
            layers: [
              { id: "img", type: "image", src: { media: "missing" }, frame: { inset: 0 } },
              { id: "t", type: "text", text: "x ".repeat(300), style: { fontSize: 60, maxLines: 1 } },
            ],
          },
        ],
      },
      {}
    )
    const assets = createMemoryAssetLoader({})
    const err = await renderSpec(resolved, { format: "png", scale: 1, assets }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RenderError)
    expect((err as RenderError).issues.map((i) => [i.code, i.path, i.slide])).toEqual([["asset.fetch_failed", "/slides/0/layers/0/src", 0]])

    const noImage = { ...resolved, slides: [{ ...resolved.slides[0], layers: resolved.slides[0].layers.slice(1) }] }
    const overflow = await renderSpec(noImage, { format: "png", scale: 1 }).catch((e: unknown) => e)
    expect((overflow as RenderError).issues.map((i) => i.code)).toEqual(["text.overflow"])
  })
})
