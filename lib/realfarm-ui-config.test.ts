import { describe, expect, it } from "vitest"

import { assetCategoryByTab, assetTabs } from "@/lib/realfarm-asset-ui-config"
import {
  automationTextPreviewClassName,
  automationTextPreviewStyle,
  defaultSlideshowTextStyle,
  slideshowTextColorOptions,
  slideshowTextFontOptions,
  slideshowTextSizeOptions,
  textStyleUsesStroke,
} from "@/lib/realfarm-slideshow-text-style-config"
describe("RealFarm UI config", () => {
  it("loads asset tabs and categories from config", () => {
    expect(assetTabs).toEqual([
      "outfits",
      "accessories",
      "background",
      "products",
    ])
    expect(assetCategoryByTab).toEqual({
      outfits: "outfit",
      accessories: "accessory",
      background: "background",
      products: "product",
    })
  })

  it("loads reusable slideshow text editor presets from config", () => {
    expect(defaultSlideshowTextStyle).toEqual({
      font: "Default",
      color: "Yellow Text",
      size: "14px",
    })
    expect(slideshowTextFontOptions).toContain("Bebas Neue")
    expect(slideshowTextColorOptions).toContain("Yellow Text")
    expect(slideshowTextSizeOptions).toContain("14px")
  })

  it("maps automation text item styles to preview rendering styles", () => {
    expect(automationTextPreviewClassName("whiteText")).toContain("text-white")
    expect(automationTextPreviewClassName("yellowText")).toContain(
      "text-yellow"
    )
    expect(automationTextPreviewClassName("background")).toContain("bg-white")
    expect(
      automationTextPreviewStyle({
        font: "Inter",
        fontSize: "12px",
        textStyle: "whiteText",
        textPosition: "top",
        textAnchor: "padded",
        textItemWidth: "80%",
        textAlign: "left",
      })
    ).toMatchObject({
      top: "14%",
      width: "80%",
      fontSize: "12px",
      textAlign: "left",
      fontFamily: "Inter, sans-serif",
    })
  })

  it("only applies an outline stroke to the Outline style", () => {
    expect(textStyleUsesStroke("outline")).toBe(true)
    expect(textStyleUsesStroke("whiteText")).toBe(false)
    expect(textStyleUsesStroke("yellowText")).toBe(false)
    expect(textStyleUsesStroke("black50Background")).toBe(false)
  })
})
