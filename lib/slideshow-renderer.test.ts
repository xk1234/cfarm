import { describe, expect, it } from "vitest"

import {
  renderedSlideSvg,
  renderedTextItemEditorBounds,
  renderedTextItemBounds,
  slideDimensions,
  slideshowTextPositionX,
} from "@/lib/slideshow-renderer"

describe("slideshow renderer", () => {
  it.each([
    ["9:16", 1080, 1920],
    ["4:5", 1080, 1350],
    ["3:4", 1080, 1440],
    ["3:2", 1080, 720],
    ["1:1", 1080, 1080],
  ])("renders the editor's %s aspect ratio", (ratio, width, height) => {
    expect(slideDimensions(ratio)).toEqual({ width, height })
  })

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
        overlay: true,
        textItems: [
          {
            ...textItem("controls", "bottom"),
            textAnchor: "flush",
            textVerticalAnchor: "flush",
          },
        ],
      },
      "/image.jpg",
      undefined,
      { aspectRatio: "4:5", font: "Arial" }
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
        overlay: false,
        textItems: [],
      },
      "/image.jpg"
    )
    expect(svg).not.toContain('data-layer="overlay"')
  })

  it.each(["cover", "contain", "fit"] as const)(
    "fills the frame with centered cover cropping for legacy %s settings",
    (imageFit) => {
      const svg = renderedSlideSvg(
        {
          id: `slide-${imageFit}`,
          image_url: "/image.jpg",
          imageFit,
          textItems: [],
        },
        "/image.jpg"
      )

      expect(svg).toContain('preserveAspectRatio="xMidYMid slice"')
      expect(svg).not.toContain('preserveAspectRatio="xMidYMid meet"')
      expect(svg).not.toContain('preserveAspectRatio="none"')
    }
  )

  it("renders a visible background when the Background text style is selected", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-background-text",
        image_url: "/image.jpg",
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
    expect(svg).not.toContain('stroke="#000000"')
    expect(svg).not.toContain('paint-order="stroke"')
  })

  it("wraps background highlights to each rendered line width", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-highlight-text",
        image_url: "/image.jpg",
        textItems: [
          {
            ...textItem(
              "a deliberately long first line followed by short words",
              "center"
            ),
            textSize: { width: 32, height: 18 },
            textStyle: "whiteBackground",
          },
        ],
      },
      "/image.jpg"
    )

    const highlights = Array.from(
      svg.matchAll(
        /data-text-background="[^"]+" data-text-background-line="(\d+)"[^>]* width="([\d.]+)"/g
      )
    )

    expect(highlights.length).toBeGreaterThan(1)
    expect(new Set(highlights.map((match) => match[2])).size).toBeGreaterThan(1)
  })

  it("renders the translucent black panel used by editorial slides", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-translucent-text",
        image_url: "/image.jpg",
        textItems: [
          {
            ...textItem("translucent", "center"),
            textStyle: "black50Background",
          },
        ],
      },
      "/image.jpg"
    )

    expect(svg).toContain('fill="#111111" fill-opacity="0.56"')
    expect(svg).not.toContain('paint-order="stroke"')
  })

  it("renders plain text and outline as visibly different styles", () => {
    const plain = renderedSlideSvg(
      {
        id: "plain",
        image_url: "/image.jpg",
        textItems: [{ ...textItem("plain", "center"), textStyle: "whiteText" }],
      },
      "/image.jpg"
    )
    const outlined = renderedSlideSvg(
      {
        id: "outlined",
        image_url: "/image.jpg",
        textItems: [
          { ...textItem("outlined", "center"), textStyle: "outline" },
        ],
      },
      "/image.jpg"
    )

    expect(plain).not.toContain('paint-order="stroke"')
    expect(outlined).toContain('paint-order="stroke"')
  })

  it("uses configured width for wrapping and the editor selection box", () => {
    const content = "one two three four five six seven eight nine ten"
    const narrow = {
      ...textItem("narrow", "center"),
      text: content,
      textSize: { width: 40, height: 18 },
    }
    const wide = {
      ...narrow,
      id: "text-wide",
      textSize: { width: 80, height: 18 },
    }
    const narrowSvg = renderedSlideSvg(
      { id: "narrow", image_url: "/image.jpg", textItems: [narrow] },
      "/image.jpg"
    )
    const wideSvg = renderedSlideSvg(
      { id: "wide", image_url: "/image.jpg", textItems: [wide] },
      "/image.jpg"
    )
    const [narrowBounds] = renderedTextItemEditorBounds([narrow], 1080, 1920)
    const [wideBounds] = renderedTextItemEditorBounds([wide], 1080, 1920)

    expect(narrowSvg.match(/<tspan/g)?.length).toBeGreaterThan(
      wideSvg.match(/<tspan/g)?.length ?? 0
    )
    expect(narrowBounds.width).toBe(432)
    expect(wideBounds.width).toBe(864)
  })

  it("wraps unspaced text and stacks text items in the shared SVG renderer", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-1",
        image_url: "/image.jpg",
        textItems: [
          {
            id: "title",
            text: "学习25分钟后休息5分钟定这有助于保持大脑清醒",
            fontSize: "10px",
            textSize: { width: 30, height: 18 },
            textStyle: "outline",
            textAlign: "center",
            textPosition: { x: 50, y: 50 },
          },
          {
            id: "body",
            text: "use the same rules in preview and final output",
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
      "/image.jpg",
      undefined,
      { aspectRatio: "4:5" }
    )

    expect(svg).toContain('id="text-padding" x="54" y="1134"')
  })

  it("allows flush left text to reach the 1.5% safe edge", () => {
    const svg = renderedSlideSvg(
      {
        id: "slide-flush-left",
        image_url: "/image.jpg",
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
        textItems: [
          {
            id: "wide-left",
            text: "this renter curtain fix should wrap without leaving the slide",
            fontSize: "8px",
            textSize: { width: 80, height: 18 },
            textStyle: "whiteText",
            textAlign: "left",
            textPosition: { x: 28, y: 45 },
          },
        ],
      },
      "/image.jpg",
      undefined,
      { aspectRatio: "4:5" }
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

  it("keeps non-overlapping debate quotes side by side", () => {
    const items = [
      {
        ...textItem("left", "top"),
        textSize: { width: 42, height: 18 },
        textAlign: "left",
        textAnchor: "flush",
        textPosition: { x: 1.5, y: 16 },
      },
      {
        ...textItem("right", "top"),
        textSize: { width: 42, height: 18 },
        textAlign: "right",
        textAnchor: "flush",
        textPosition: { x: 98.5, y: 16 },
      },
    ]

    const [left, right] = renderedTextItemBounds(items, 1080, 1350)
    expect(Math.abs(left.top - right.top)).toBeLessThan(2)
    expect(left.left + left.width).toBeLessThan(right.left)
  })
})

function textItem(id: string, textPlacement: "top" | "center" | "bottom") {
  return {
    id: `text-${id}`,
    text: id,
    fontSize: "10px",
    textSize: { width: 50, height: 18 },
    textStyle: "whiteText",
    textAlign: "center",
    textPlacement,
    textPosition: { x: 50, y: 50 },
  }
}
