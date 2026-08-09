import { describe, expect, it } from "vitest"

import {
  BUNDLED_FONT_FAMILY,
  PIN_SET_34A_FONT_ASSIGNMENTS,
  SLIDESHOW_FONT_FACES,
  __resetFontconfigForTests,
  bundledFontDir,
  configureFontconfig,
  fontconfigConfigured,
  resolveSlideshowFont,
  resolveSlideshowFontWeight,
} from "@/lib/font-config"
import { renderSlideshowSlideBuffers } from "@/lib/slideshow-raster-renderer"

// 1x1 transparent PNG data URI — keeps the slide SVG well-formed without
// pulling any external image bytes into the raster.
const placeholderImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"

function slide(text: string) {
  return {
    id: `slide-${text.length}`,
    image_url: placeholderImage,
    textItems: [
      {
        id: "text-1",
        text,
        fontSize: "48px",
        textSize: { width: 90, height: 20 },
        textStyle: "whiteText" as const,
        textAlign: "center" as const,
        textPosition: { x: 50, y: 50 },
      },
    ],
  }
}

async function rasterize(text: string): Promise<Buffer> {
  configureFontconfig()
  const rendered = await renderSlideshowSlideBuffers({
    slide: slide(text),
    sourceUrl: placeholderImage,
  })
  return rendered.png
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

  it("registers every supplied editor font and maps the PIN Set families", () => {
    expect(SLIDESHOW_FONT_FACES).toHaveLength(22)
    expect(resolveSlideshowFont("JenthillLight")).toBe(
      PIN_SET_34A_FONT_ASSIGNMENTS["Jenthill Light"]
    )
    expect(resolveSlideshowFont("HerticalSans-Smooth")).toBe(
      "Hertical Sans Smooth"
    )
    expect(resolveSlideshowFont("Rumba-Regular")).toBe("Sunset Script")
    expect(resolveSlideshowFont("Sunflower")).toBe("Casual Human")
    expect(resolveSlideshowFont("Maldina")).toBe("Buffalo")
    expect(resolveSlideshowFont("Seattle-Regular")).toBe("Casual Human")
    expect(resolveSlideshowFont("Buffalo-Regular")).toBe("Buffalo")
  })

  it("uses face-appropriate weights instead of forcing every font bold", () => {
    expect(resolveSlideshowFontWeight("Inter")).toBe(800)
    expect(resolveSlideshowFontWeight("Angelina")).toBe(400)
    expect(resolveSlideshowFontWeight("Casual Human Bold")).toBe(700)
    expect(resolveSlideshowFontWeight("Yoriglo", 550)).toBe(600)
  })

  it("configures FONTCONFIG_FILE to a config pointing only at the bundled dir", () => {
    __resetFontconfigForTests()
    expect(fontconfigConfigured()).toBe(false)
    expect(bundledFontDir()).not.toBeNull()
    expect(configureFontconfig()).toBe(true)
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
