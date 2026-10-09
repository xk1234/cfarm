/**
 * Golden-image tests for the render engine: the doc 01 fixtures, every
 * starter template (with its sample values) and legacy-record parity cases.
 * Images are synthetic and deterministic; comparisons tolerate small text
 * rasterization differences between Pango builds (see expectGolden).
 *
 * Update goldens: UPDATE_GOLDEN=1 pnpm vitest run test/render
 */
import { readFileSync } from "node:fs"
import path from "node:path"

import { beforeAll, describe, it } from "vitest"

import { createMemoryAssetLoader } from "@/lib/render/assets"
import { renderSpec } from "@/lib/render/engine"
import { legacySlideSpec, LEGACY_SOURCE_MEDIA } from "@/lib/render/legacy/from-slideshow-record"
import type { SlideshowSlide } from "@/lib/render/legacy/slideshow-record"
import { prepareNodeRenderer } from "@/lib/render/node/platform"
import { resolveTemplate, type ResolvedSpec, type SlideshowSpec, type SlotValues } from "@/lib/render/spec"
import { listStarterTemplates } from "@/lib/render/templates"

import { expectGolden, syntheticAssetLoader, syntheticPhoto } from "./helpers"

const SCALE = 0.5
const MAX_SLIDES_PER_CASE = 2

beforeAll(async () => {
  await prepareNodeRenderer()
})

async function renderGoldens(name: string, resolved: ResolvedSpec, assets = syntheticAssetLoader(resolved)) {
  const slides = resolved.slides.slice(0, MAX_SLIDES_PER_CASE).map((_, i) => i)
  const result = await renderSpec(resolved, { format: "png", scale: SCALE, slides, assets })
  for (const slide of result.slides) await expectGolden(`${name}-${slide.index}`, slide.bytes)
}

const collections = async () => ["collection-a", "collection-b", "collection-c"]

describe("golden: doc 01 fixtures", () => {
  const dir = path.join(process.cwd(), "lib/render/fixtures")
  for (const name of ["listicle", "quote-carousel", "collage"]) {
    it(name, async () => {
      const template = JSON.parse(readFileSync(path.join(dir, `${name}.template.json`), "utf8")) as SlideshowSpec
      const values = JSON.parse(readFileSync(path.join(dir, `${name}.values.json`), "utf8")) as SlotValues
      await renderGoldens(`fixture-${name}`, await resolveTemplate(template, values, { resolveCollection: collections }))
    })
  }
})

describe("golden: starter templates", () => {
  for (const t of listStarterTemplates()) {
    it(t.id, async () => {
      await renderGoldens(t.id, await resolveTemplate(t.spec, t.sampleValues))
    })
  }
})

describe("golden: legacy parity", () => {
  const base: SlideshowSlide = {
    id: "slide-1",
    image_url: "/source.png",
    textItems: [],
  }
  const cases: [string, SlideshowSlide][] = [
    [
      "outline-top",
      {
        ...base,
        overlay: true,
        textItems: [
          {
            id: "hook",
            text: "Things nobody tells you about moving abroad",
            fontSize: "16px",
            textSize: { width: 84, height: 20 },
            textStyle: "outline",
            textAlign: "center",
            textPlacement: "top",
            textPosition: { x: 50, y: 16 },
          },
        ],
      },
    ],
    [
      "pill-bottom",
      {
        ...base,
        textItems: [
          {
            id: "caption",
            text: "Pack half the clothes and twice the patience",
            fontSize: "12px",
            textSize: { width: 80, height: 20 },
            textStyle: "whiteBackground",
            textAlign: "left",
            textAnchor: "padded",
            textPlacement: "bottom",
            textPosition: { x: 10, y: 84 },
          },
        ],
      },
    ],
  ]
  for (const [name, slide] of cases) {
    it(name, async () => {
      const resolved = await resolveTemplate(legacySlideSpec({ slide, settings: { aspect_ratio: "9:16" } }), {})
      const assets = createMemoryAssetLoader({ [`media:${LEGACY_SOURCE_MEDIA}`]: { bytes: syntheticPhoto(name, 1080, 1920), mime: "image/png" } })
      await renderGoldens(`legacy-${name}`, resolved, assets)
    })
  }
})
