import { describe, expect, it } from "vitest"

import {
  renderedSlideSvg,
  renderedTextItemBounds,
  slideshowTextPositionX,
} from "@/lib/slideshow-renderer"

describe("slideshow renderer", () => {
  it("uses a pronounced 10% inset for padded left and right text", () => {
    expect(slideshowTextPositionX("left", "padded")).toBe(10)
    expect(slideshowTextPositionX("right", "padded")).toBe(90)
    expect(slideshowTextPositionX("left", "flush")).toBe(1.5)
    expect(slideshowTextPositionX("right", "flush")).toBe(98.5)
  })

  it("renders the fixed 20% overlay, font, and anchor", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-controls",
        image_url: "/image.jpg",
        aspect_ratio: "4:5",
        time_length_ms: 3000,
        overlay: true,
        textItems: [
          {
            ...textItem("controls", "bottom"),
            font: "Arial",
            textAnchor: "flush",
            textVerticalAnchor: "flush",
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('data-layer="overlay"')
    expect(svg).toContain('opacity="0.2"')
    expect(svg).toContain('font-family="Arial, Inter, Arial, sans-serif"')
    expect(svg).toContain('id="text-controls" x="540" y="1283"')
  })

  it("does not render a dark overlay when the switch is off", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-no-overlay",
        image_url: "/image.jpg",
        aspect_ratio: "9:16",
        time_length_ms: 3000,
        overlay: false,
        textItems: [],
      },
      "/image.jpg"
    )
    expect(svg).not.toContain('data-layer="overlay"')
  })

  it("renders a visible background when the Background text style is selected", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-background-text",
        image_url: "/image.jpg",
        aspect_ratio: "9:16",
        time_length_ms: 3000,
        textItems: [
          {
            ...textItem("background", "center"),
            textStyle: "background",
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('data-text-background="text-background"')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('id="text-background"')
    expect(svg).toContain('fill="#111111"')
  })

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

  it("keeps horizontal and vertical padding independent", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-padding",
        image_url: "/image.jpg",
        aspect_ratio: "4:5",
        time_length_ms: 3000,
        textItems: [
          {
            ...textItem("padding", "bottom"),
            textAlign: "left",
            textAnchor: "flush",
            textVerticalAnchor: "padded",
            textSize: { width: 50, height: 18 },
            textPosition: { x: 5, y: 50 },
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('id="text-padding" x="54" y="1134"')
  })

  it("allows flush left text to reach the 1.5% safe edge", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-flush-left",
        image_url: "/image.jpg",
        aspect_ratio: "9:16",
        time_length_ms: 3000,
        textItems: [
          {
            ...textItem("flush-left", "center"),
            textAlign: "left",
            textAnchor: "flush",
            textPosition: { x: 1.5, y: 45 },
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('id="text-flush-left" x="16" y="864"')
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

    expect(svg).toContain('id="wide-left" x="108" y="608" text-anchor="start"')
  })

  it("returns tight, separate selection bounds for stacked text", () => {
    const items = [
      {
        ...textItem("title", "center"),
        text: "short heading",
        fontSize: "8px",
        textSize: { width: 80, height: 18 },
        textAlign: "left",
        textPosition: { x: 28, y: 45 },
      },
      {
        ...textItem("body", "center"),
        text: "supporting copy on a second line",
        fontSize: "8px",
        textSize: { width: 80, height: 18 },
        textAlign: "left",
        textPosition: { x: 28, y: 45 },
      },
    ]

    const [title, body] = renderedTextItemBounds(items, 1080, 1920)

    expect(title.width).toBeLessThan(1080 * 0.35)
    expect(body.width).toBeLessThan(1080 * 0.6)
    expect(title.top + title.height).toBeLessThan(body.top)
  })

  it("keeps the first item anchored and places added text below it", () => {
    const first = {
      ...textItem("first", "center"),
      text: "first text",
      fontSize: "8px",
      textSize: { width: 60, height: 18 },
    }
    const second = {
      ...first,
      id: "text-second",
      text: "second text",
    }
    const [single] = renderedTextItemBounds([first], 1080, 1920)
    const [stackedFirst, stackedSecond] = renderedTextItemBounds(
      [first, second],
      1080,
      1920
    )

    expect(stackedFirst.top).toBe(single.top)
    expect(stackedFirst.top + stackedFirst.height).toBeLessThan(
      stackedSecond.top
    )
  })

  it("stacks same-height text into rows even when alignment and x differ", () => {
    const items = [
      {
        ...textItem("left-row", "center"),
        text: "left aligned title",
        textAlign: "left",
        textAnchor: "padded",
        textPosition: { x: 10, y: 45 },
      },
      {
        ...textItem("right-row", "center"),
        text: "right aligned support",
        textAlign: "right",
        textAnchor: "padded",
        textPosition: { x: 90, y: 45 },
      },
    ]

    const [first, second] = renderedTextItemBounds(items, 1080, 1920)

    expect(first.top + first.height).toBeLessThan(second.top)
    expect(first.left).toBeLessThan(second.left)
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
