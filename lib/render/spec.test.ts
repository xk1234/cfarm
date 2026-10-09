import { describe, expect, it } from "vitest"

import collageTemplate from "./fixtures/collage.template.json"
import collageValues from "./fixtures/collage.values.json"
import listicleTemplate from "./fixtures/listicle.template.json"
import listicleValues from "./fixtures/listicle.values.json"
import quoteTemplate from "./fixtures/quote-carousel.template.json"
import quoteValues from "./fixtures/quote-carousel.values.json"
import {
  canonicalJson,
  canvasSize,
  getSpecJsonSchema,
  RenderRequestSchema,
  resolveTemplate,
  seededIndex,
  SpecError,
  validateSlotValues,
  validateSpec,
  type ResolvedTextLayer,
  type SlideshowSpec,
} from "./spec"

/** Fixture copies are mutated freely to build invalid specs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const listicle = listicleTemplate as unknown as SlideshowSpec
const quote = quoteTemplate as unknown as SlideshowSpec
const collage = collageTemplate as unknown as SlideshowSpec
const bedroom = ["m-bed-0", "m-bed-1", "m-bed-2", "m-bed-3", "m-bed-4"]
const resolveCollection = async (c: string) => (c === "bedroom-aesthetic" ? bedroom : null)

async function expectSpecError(p: Promise<unknown>): Promise<SpecError> {
  const err = await p.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(SpecError)
  return err as SpecError
}

describe("validateSpec", () => {
  it.each([
    ["listicle", listicleTemplate, listicleValues],
    ["quote carousel", quoteTemplate, quoteValues],
    ["collage", collageTemplate, collageValues],
  ])("accepts the doc 01 %s example with its slot values", (_name, template, values) => {
    const result = validateSpec(template, { slotValues: values })
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.spec?.version).toBe(1)
  })

  it("reports structural errors as JSON Pointer issues", () => {
    const spec = clone(listicleTemplate) as Loose
    spec.slides[1].slide.layers[2].frame.width = "84"
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({
      code: "schema.invalid_type",
      path: "/slides/1/slide/layers/2/frame/width",
      message: 'Expected a number, a percentage string like "84%", or "auto".',
    })
  })

  it("rejects unknown keys and wrong layer types", () => {
    const spec = clone(collageTemplate) as Loose
    spec.slides[0].layers[1].colour = "#fff"
    const result = validateSpec(spec)
    expect(result.errors.map((e) => [e.code, e.path])).toContainEqual([
      "schema.unrecognized_keys",
      "/slides/0/layers/1",
    ])
  })

  it("flags unknown slots, tokens, styles and fonts", () => {
    const spec = clone(listicleTemplate) as Loose
    spec.slides[0].layers[2].text = "{{nope}}"
    spec.slides[0].layers[1].fill = "$colors.missing"
    spec.slides[2].layers[1].style = "missingStyle"
    spec.theme.textStyles.itemBody.fontFamily = "Comic Sans"
    const codes = validateSpec(spec).errors.map((e) => `${e.code} ${e.path}`)
    expect(codes).toEqual(
      expect.arrayContaining([
        "slot.unknown /slides/0/layers/2/text",
        "token.unknown /slides/0/layers/1/fill",
        "style.unknown /slides/2/layers/1/style",
        "font.unknown /theme/textStyles/itemBody/fontFamily",
      ])
    )
  })

  it("flags weights a font family does not have", () => {
    const spec = clone(quoteTemplate) as Loose
    spec.theme.textStyles.quote.fontWeight = 700
    const errors = validateSpec(spec).errors
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ code: "font.weight_unavailable", path: "/slides/0/slide/layers/1/style" })
  })

  it("requires repeat slots to be lists and ids to be unique per slide", () => {
    const spec = clone(collageTemplate) as Loose
    spec.slides[0].layers[0].children[0].repeat.slot = "label"
    spec.slides[0].layers[1].id = "grid"
    const codes = validateSpec(spec).errors.map((e) => e.code)
    expect(codes).toContain("repeat.not_list")
    expect(codes).toContain("layer.duplicate_id")
  })

  it("requires a canvas size and limits nesting depth", () => {
    const deep = (n: number): Record<string, unknown> =>
      n === 0
        ? { id: "leaf", type: "shape", shape: "rect", fill: "#fff" }
        : { id: `g${n}`, type: "group", children: [deep(n - 1)] }
    const result = validateSpec({ version: 1, canvas: {}, slides: [{ id: "s", layers: [deep(4)] }] })
    const codes = result.errors.map((e) => e.code)
    expect(codes).toContain("canvas.size_required")
    expect(codes).toContain("limits.depth")
  })

  it("warns when stack/grid children carry positions", () => {
    const spec = clone(collageTemplate) as Loose
    spec.slides[0].layers[0].children[0].layer.frame = { x: 10, y: 10 }
    const result = validateSpec(spec)
    expect(result.ok).toBe(true)
    expect(result.warnings.map((w) => w.code)).toEqual(["layout.frame_ignored"])
  })

  it("rejects specs over the size limit", () => {
    const spec = clone(collageTemplate) as Loose
    spec.meta = { blob: "x".repeat(300 * 1024) }
    expect(validateSpec(spec).errors[0].code).toBe("limits.spec_size")
  })

  it("enforces the slide limit after repeat expansion", () => {
    const quotes = Array.from({ length: 10 }, () => ({ text: "q" }))
    const spec = clone(quoteTemplate) as Loose
    spec.slots.quotes.maxItems = 40
    const values = { author: "a", quotes: [...quotes, ...quotes, ...quotes, ...quotes] }
    expect(validateSpec(spec, { slotValues: values }).errors.map((e) => e.code)).toContain("limits.slides")
  })
})

describe("validateSlotValues", () => {
  it("reports required, type, max length, list bounds and unused values", () => {
    const { errors, warnings } = validateSlotValues(listicle.slots, {
      hook: "x".repeat(141),
      items: [{ title: 5, image: "http://insecure.example/a.jpg" }],
      extra: true,
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "slot.max_length", path: "/slotValues/hook" }),
        expect.objectContaining({ code: "slot.required", path: "/slotValues/hookImage" }),
        expect.objectContaining({ code: "slot.type", path: "/slotValues/items/0/title" }),
        expect.objectContaining({ code: "slot.type", path: "/slotValues/items/0/image" }),
      ])
    )
    expect(warnings).toEqual([expect.objectContaining({ code: "slot.unused", path: "/slotValues/extra" })])
    expect(validateSlotValues(collage.slots, { label: "x", photos: [] }).errors[0].code).toBe("slot.list_bounds")
  })
})

describe("resolveTemplate", () => {
  it("resolves the listicle example into 4 literal slides", async () => {
    const resolved = await resolveTemplate(listicle, listicleValues, { resolveCollection })
    expect(resolved.canvas).toEqual({ width: 1080, height: 1920, background: "#111111" })
    expect(resolved.slides.map((s) => s.id)).toEqual(["hook", "item-1", "item-2", "cta"])

    const hook = resolved.slides[0]
    expect(hook.layers[0]).toMatchObject({ type: "image", src: { media: "6650f1c2000a1b2c3d4e" }, fit: "cover" })
    const hookText = hook.layers[2] as ResolvedTextLayer
    expect(hookText.text).toBe("5 sleep habits that *actually* worked for me")
    expect(hookText.markup).toBe("emphasis")
    expect(hookText.style).toMatchObject({ fontFamily: "Inter", fontWeight: 800, color: "#FFFFFF", overflow: "shrink" })
    expect(hookText.emphasisStyle).toEqual({ color: "#FFF176" })

    const item2 = resolved.slides[2]
    expect(item2.layers[0]).toMatchObject({
      src: {
        media: bedroom[seededIndex("2026-10-09:items/1/image", bedroom.length)],
        from: { collection: "bedroom-aesthetic", pick: "random", seed: "2026-10-09" },
      },
    })
    const copy = item2.layers[2]
    expect(copy.type === "group" && copy.children.map((c) => c.id)).toEqual(["badge", "title"])
    expect((item2.layers[3] as ResolvedTextLayer).text).toBe("3/4")

    const item1Copy = resolved.slides[1].layers[2]
    expect(item1Copy.type === "group" && item1Copy.children.map((c) => c.id)).toEqual(["badge", "title", "body"])

    const cta = resolved.slides[3]
    expect(cta.layers.map((l) => l.id)).toEqual(["cta-text"])
    expect((cta.layers[0] as ResolvedTextLayer).text).toBe("Save this for tonight")
  })

  it("is deterministic for seeded collection picks", async () => {
    const a = await resolveTemplate(listicle, listicleValues, { resolveCollection })
    const b = await resolveTemplate(listicle, listicleValues, { resolveCollection })
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it("resolves the quote carousel with colour slot defaults and page numbers", async () => {
    const resolved = await resolveTemplate(quote, quoteValues)
    expect(resolved.canvas).toEqual({ width: 1080, height: 1350, background: "#F4EFE6" })
    expect(resolved.slides.map((s) => s.id)).toEqual(["quote-1", "quote-2", "quote-3"])
    const pager = resolved.slides[1].layers[4] as ResolvedTextLayer
    expect(pager.text).toBe("2 / 3")
    expect(pager.style).toMatchObject({ fontFamily: "Inter", align: "right", letterSpacing: 0, textTransform: "uppercase" })
    expect((resolved.slides[0].layers[3] as ResolvedTextLayer).text).toBe("— Marcus Aurelius")
  })

  it("expands layer repeats inside a grid group", async () => {
    const resolved = await resolveTemplate(collage, collageValues)
    const grid = resolved.slides[0].layers[0]
    expect(grid.type).toBe("group")
    if (grid.type !== "group") return
    expect(grid.layout).toEqual({ type: "grid", columns: 2, rows: 2, gap: 12 })
    expect(grid.children.map((c) => c.id)).toEqual(["cell~0", "cell~1", "cell~2", "cell~3"])
    expect(grid.children[3]).toMatchObject({ src: { media: "media-4" }, cornerRadius: 20, opacity: 1, rotation: 0 })
  })

  it("throws a SpecError with slot issues", async () => {
    const err = await expectSpecError(resolveTemplate(listicle, { hook: "hi", items: [] }))
    expect(err.errors.map((e) => `${e.code} ${e.path}`)).toEqual(
      expect.arrayContaining(["slot.required /slotValues/hookImage", "slot.list_bounds /slotValues/items"])
    )
  })

  it("requires a resolver for collection picks and reports empty collections", async () => {
    const values = clone(listicleValues) as Loose
    const noResolver = await expectSpecError(resolveTemplate(listicle, values))
    expect(noResolver.errors[0]).toMatchObject({ code: "asset.collection_unresolved", path: "/slotValues/items/1/image" })
    values.items[1].image.collection = "gone"
    const empty = await expectSpecError(resolveTemplate(listicle, values, { resolveCollection }))
    expect(empty.errors[0].code).toBe("asset.collection_empty")
  })

  it("supports {{{{ escapes and string image values", async () => {
    const spec: SlideshowSpec = {
      version: 1,
      canvas: { width: 800, height: 600 },
      slots: { photo: { type: "image" }, name: { type: "text", default: "you" } },
      slides: [
        {
          id: "only",
          layers: [
            { id: "p", type: "image", src: { slot: "photo" } },
            { id: "t", type: "text", text: "{{{{literal}} hi {{name}}" },
          ],
        },
      ],
    }
    const resolved = await resolveTemplate(spec, { photo: "https://images.example/a.jpg" })
    expect(resolved.slides[0].layers[0]).toMatchObject({ src: { url: "https://images.example/a.jpg" } })
    expect((resolved.slides[0].layers[1] as ResolvedTextLayer).text).toBe("{{literal}} hi you")
    expect(resolved.slides[0].background).toBe("#000000")
  })
})

describe("helpers", () => {
  it("derives canvas sizes from presets", () => {
    expect(canvasSize({ preset: "9:16" })).toEqual({ width: 1080, height: 1920 })
    expect(canvasSize({ preset: "16:9", width: 1920 })).toEqual({ width: 1920, height: 1080 })
    expect(canvasSize({ width: 500 })).toBeNull()
  })

  it("exports a JSON Schema for spec v1", () => {
    const schema = getSpecJsonSchema()
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(schema.type).toBe("object")
    expect(schema.required).toEqual(expect.arrayContaining(["version", "canvas", "slides"]))
    expect(JSON.stringify(schema)).toContain('"group"')
  })

  it("validates render requests", () => {
    expect(RenderRequestSchema.safeParse({ templateId: "t1", output: { format: "png" } }).success).toBe(true)
    expect(RenderRequestSchema.safeParse({ templateId: "t1", spec: collage }).success).toBe(false)
    expect(RenderRequestSchema.safeParse({ spec: collage, output: { format: "pdf" } }).success).toBe(false)
  })

  it("produces canonical JSON with sorted keys", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}')
  })
})
