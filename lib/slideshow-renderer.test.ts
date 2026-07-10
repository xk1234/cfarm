import { describe, expect, it } from "vitest"

import { renderedSlideSvg } from "@/lib/slideshow-renderer"

describe("slideshow renderer", () => {
  it("wraps unspaced text and stacks text items in the shared SVG renderer", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-1",
        image_url: "/image.jpg",
        aspect_ratio: "9:16",
        time_length_ms: 3000,
        textItems: [
          {
            id: "title",
            text: "学习25分钟后休息5分钟定这有助于保持大脑清醒",
            font: "TikTok Display Medium",
            fontSize: "10px",
            textSize: { width: 30, height: 18 },
            textStyle: "outline",
            textAlign: "center",
            textPosition: { x: 50, y: 50 },
          },
          {
            id: "body",
            text: "use the same rules in preview and final output",
            font: "TikTok Display Medium",
            fontSize: "8px",
            textSize: { width: 30, height: 18 },
            textStyle: "whiteText",
            textAlign: "center",
            textPosition: { x: 50, y: 50 },
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain("<svg")
    expect(svg).toContain("<tspan")
    expect(svg).toContain("学习")
    expect(svg).toContain("use the same")
    expect(svg).toContain('paint-order="stroke"')
  })

  it("honors explicit textPlacement when rendering SVG text y positions", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-1",
        image_url: "/image.jpg",
        aspect_ratio: "9:16",
        time_length_ms: 3000,
        textItems: [
          textItem("top", "top"),
          textItem("center", "center"),
          textItem("bottom", "bottom"),
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('id="text-top"')
    expect(svg).toContain('id="text-center"')
    expect(svg).toContain('id="text-bottom"')
    expect(svg).toContain('id="text-top" x="540" y="307"')
    expect(svg).toContain('id="text-center" x="540" y="864"')
    expect(svg).toContain('id="text-bottom" x="540" y="1613"')
  })

  it("keeps wide left-aligned text inside the slide canvas", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-1",
        image_url: "/image.jpg",
        aspect_ratio: "4:5",
        time_length_ms: 3000,
        textItems: [
          {
            id: "wide-left",
            text: "this renter curtain fix should wrap without leaving the slide",
            font: "TikTok Display Medium",
            fontSize: "8px",
            textSize: { width: 80, height: 18 },
            textStyle: "whiteText",
            textAlign: "left",
            textPosition: { x: 28, y: 45 },
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('id="wide-left" x="162" y="608" text-anchor="start"')
  })
})

function textItem(id: string, textPlacement: "top" | "center" | "bottom") {
  return {
    id: `text-${id}`,
    text: id,
    font: "TikTok Display Medium",
    fontSize: "10px",
    textSize: { width: 50, height: 18 },
    textStyle: "whiteText",
    textAlign: "center",
    textPlacement,
    textPosition: { x: 50, y: 50 },
  }
}
