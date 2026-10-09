import { describe, expect, it } from "vitest"

import { resolveTemplate, validateSpec, type ImageLayer, type ShapeLayer, type TextLayer, type TextStyle } from "../spec"
import { legacyFontFamily, legacyFontSize, legacySlideSpec, legacyTextLook } from "./from-slideshow-record"
import type { SlideshowSlide } from "./slideshow-record"

const slide = (over: Partial<SlideshowSlide> = {}): SlideshowSlide => ({
  id: "slide-1",
  image_url: "/x.png",
  textItems: [
    {
      id: "t1",
      text: "Hello {{world}}",
      fontSize: "14px",
      textSize: { width: 80, height: 20 },
      textStyle: "outline",
      textAlign: "center",
      textPlacement: "top",
      textPosition: { x: 50, y: 20 },
    },
  ],
  ...over,
})

describe("legacy slideshow mapping", () => {
  it("bakes the old implicit rules into explicit numbers", () => {
    expect(legacyFontSize("14px")).toBe(56)
    expect(legacyFontSize("40px")).toBe(96)
    expect(legacyFontSize("2px")).toBe(32)
    expect(legacyFontFamily("TikTok Display Medium")).toBe("Inter")
    expect(legacyFontFamily("Thumpa")).toBe("Thumpa")
    expect(legacyFontFamily("Bebas Neue")).toBe("Inter")
    expect(legacyTextLook("white50Background")).toEqual({ color: "#111111", background: { color: "#FFFFFF", opacity: 0.56 } })
    expect(legacyTextLook("navy-blue").color).toBe("#1E3A5F")
  })

  it("builds a valid single-slide spec that honours fit and background colour", async () => {
    const spec = legacySlideSpec({
      slide: slide({ imageFit: "fit", overlay: true }),
      settings: { aspect_ratio: "4:5", font: "Thumpa", background_color: "#F4EFE6" },
    })
    expect(validateSpec(spec).errors).toEqual([])
    expect(spec.canvas).toEqual({ preset: "4:5", background: "#F4EFE6" })
    const [image, overlay, text] = spec.slides[0].layers as [ImageLayer, ShapeLayer, TextLayer]
    expect(image.fit).toBe("contain")
    expect(overlay.opacity).toBe(0.2)
    const style = text.style as TextStyle
    expect(style).toMatchObject({ fontFamily: "Thumpa", fontWeight: 400, fontSize: 56, color: "#FFFFFF" })
    expect(style.stroke?.width).toBeCloseTo(7.28)
    expect(text.frame).toMatchObject({ x: 540, anchor: "top", width: 864 })
    // y = 16% of 1350 minus half a 1.12 line box
    expect(text.frame?.y).toBeCloseTo(216 - 31.36)
    const resolved = await resolveTemplate(spec, {})
    const resolvedText = resolved.slides[0].layers[2]
    expect(resolvedText.type === "text" && resolvedText.text).toBe("Hello {{world}}")
  })

  it("maps the oval icon layout to explicit sticker groups", () => {
    const spec = legacySlideSpec({
      slide: slide({ iconLayout: { kind: "oval-icons", surrounding: [{ image_url: "/i.png", x: 20, y: 30, scale: 2, rotation: 8 }] }, textItems: [] }),
      iconCount: 1,
    })
    expect(validateSpec(spec).errors).toEqual([])
    const ids = spec.slides[0].layers.map((l) => ("id" in l ? l.id : ""))
    expect(ids).toEqual(["icon-backdrop", "icon-oval", "icon-1", "icon-focal"])
  })
})
