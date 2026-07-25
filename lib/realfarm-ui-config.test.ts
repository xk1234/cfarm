import { describe, expect, it } from "vitest"

import {
  automationTextPreviewClassName,
  automationTextPreviewStyle,
  textStyleUsesStroke,
} from "@/lib/realfarm-slideshow-text-style-config"
describe("RealFarm UI config", () => {
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
