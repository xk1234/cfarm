import { existsSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  BUNDLED_FONT_FAMILY,
  __resetFontconfigForTests,
  configureFontconfig,
  fontconfigConfigured,
  resolveSlideshowFont,
} from "@/lib/font-config"
import { renderedSlideSvg } from "@/lib/slideshow-renderer"

const fontDir = "assets/fonts"
const fontFile = `${fontDir}/Inter-Variable.ttf`

// 1x1 transparent PNG data URI — keeps the slide SVG well-formed without
// pulling any external image bytes into the raster.
const placeholderImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"

function slideSvg(text: string) {
  return renderedSlideSvg(
    {
      id: `slide-${text.length}`,
      image_url: placeholderImage,
      textItems: [
        {
          id: "text-1",
          text,
          fontSize: "48px",
          textSize: { width: 90, height: 20 },
          textStyle: "whiteText",
          textAlign: "center",
          textPosition: { x: 50, y: 50 },
        },
      ],
    },
    placeholderImage
  )
}

async function rasterize(text: string): Promise<Buffer> {
  configureFontconfig(fontDir)
  const sharp = (await import("sharp")).default
  return sharp(Buffer.from(slideSvg(text))).png().toBuffer()
}

// Count pixels whose luminance is bright (rendered white text). The slide
// background is #111, so anything well above it is text ink.
async function inkArea(png: Buffer): Promise<number> {
  const sharp = (await import("sharp")).default
  const rgba = await sharp(png).raw().toBuffer()
  let ink = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > 128 && rgba[i + 1] > 128 && rgba[i + 2] > 128) ink++
  }
  return ink
}

describe("bundled font fallback", () => {
  it("ships the bundled TTF in the repo", () => {
    expect(existsSync(fontFile)).toBe(true)
  })

  it("maps the proprietary default and unknown names to the bundled family", () => {
    expect(resolveSlideshowFont("TikTok Display Medium")).toBe(
      BUNDLED_FONT_FAMILY
    )
    expect(resolveSlideshowFont("TikTok Display")).toBe(BUNDLED_FONT_FAMILY)
    expect(resolveSlideshowFont("Some Unknown Brand Font")).toBe(
      BUNDLED_FONT_FAMILY
    )
    expect(resolveSlideshowFont(undefined)).toBe(BUNDLED_FONT_FAMILY)
  })

  it("passes generic CSS families through unchanged", () => {
    expect(resolveSlideshowFont("serif")).toBe("serif")
    expect(resolveSlideshowFont("sans-serif")).toBe("sans-serif")
    expect(resolveSlideshowFont("monospace")).toBe("monospace")
  })

  it("configures FONTCONFIG_FILE to a config pointing only at the bundled dir", () => {
    __resetFontconfigForTests()
    expect(fontconfigConfigured()).toBe(false)
    configureFontconfig(fontDir)
    expect(fontconfigConfigured()).toBe(true)
    expect(process.env.FONTCONFIG_FILE).toBeTruthy()
  })

  it("renders distinct glyphs (not identical tofu boxes) with the bundled font", async () => {
    // Tofu (.notdef) renders the SAME box for every character, so eight W's
    // and eight dots produce identical ink. Real glyphs render W far heavier
    // than '.', so the ink areas diverge significantly — proving the bundled
    // TTF (not .notdef) is being rasterized with no reliance on system fonts.
    __resetFontconfigForTests()
    const wide = await rasterize("WWWWWWWW")
    const narrow = await rasterize("........")
    const wideInk = await inkArea(wide)
    const narrowInk = await inkArea(narrow)

    expect(wideInk).toBeGreaterThan(0)
    expect(narrowInk).toBeGreaterThan(0)
    // W glyphs cover substantially more pixels than dots; tofu boxes would
    // be ~equal. 1.8x margin is well clear of anti-aliasing noise.
    expect(wideInk).toBeGreaterThan(narrowInk * 1.8)
  })
})