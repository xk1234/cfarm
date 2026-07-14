import { describe, expect, it } from "vitest"

import { defaultAutomationTextItem } from "@/lib/realfarm-automation"

import {
  videoAutomationPreviewTextHighlightStyle,
  videoAutomationPreviewTextStyle,
} from "./video-format-helpers"

describe("video automation preview text", () => {
  it("uses the final 720x1280 renderer coordinates", () => {
    const style = videoAutomationPreviewTextStyle(
      defaultAutomationTextItem({
        textPosition: "bottom",
        textAlign: "right",
        textItemWidth: "80%",
      })
    )

    expect(style.top).toBe(`${(930 / 1280) * 100}%`)
    expect(style.left).toBe("88%")
    expect(style.width).toBe("80%")
    expect(style.transform).toBe("translate(-100%, -50%)")
  })

  it("scales font and outline relative to the preview canvas", () => {
    const style = videoAutomationPreviewTextStyle(
      defaultAutomationTextItem({
        fontSize: "8px",
        textStyle: "outline",
      })
    )

    expect(style.fontSize).toMatch(/cqw$/)
    expect(style.WebkitTextStroke).toMatch(/cqw rgba\(0,0,0,/)
    expect(style.fontWeight).toBe(900)
    expect(style.lineHeight).toBe(1.16)
  })

  it("matches renderer fills for background text styles", () => {
    expect(
      videoAutomationPreviewTextHighlightStyle(
        defaultAutomationTextItem({ textStyle: "black50Background" })
      )?.backgroundColor
    ).toBe("#00000080")
    expect(
      videoAutomationPreviewTextHighlightStyle(
        defaultAutomationTextItem({ textStyle: "whiteBackground" })
      )?.backgroundColor
    ).toBe("#ffffffeb")
  })

  it("uses cloned inline decoration so every wrapped line fits its text", () => {
    const style = videoAutomationPreviewTextHighlightStyle(
      defaultAutomationTextItem({ textStyle: "background" })
    )

    expect(style).toMatchObject({
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
    })
    expect(
      videoAutomationPreviewTextStyle(defaultAutomationTextItem())
        .backgroundColor
    ).toBe("transparent")
  })
})
