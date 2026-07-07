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
})
