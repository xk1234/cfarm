import { describe, expect, it } from "vitest"

import {
  newAutomationTextItemAfter,
  previewSlideshowSlide,
  previewSlideshowTextItems,
  previewTrackOffsetForWidths,
  updateAutomationTextItemAt,
  type AutomationFormatPreviewItem,
} from "./format-helpers"
import {
  defaultAutomationTextItem,
  type AutomationSchema,
} from "@/lib/realfarm-automation"

describe("preview track spacing", () => {
  it("centers variable-width slides with a fixed edge-to-edge gap", () => {
    const widths = [352.5, 370, 625]
    const gap = 50

    expect(previewTrackOffsetForWidths(widths, 0, gap)).toBe(176.25)
    expect(previewTrackOffsetForWidths(widths, 1, gap)).toBe(587.5)
    expect(previewTrackOffsetForWidths(widths, 2, gap)).toBe(1135)

    expect(
      previewTrackOffsetForWidths(widths, 1, gap) -
        previewTrackOffsetForWidths(widths, 0, gap)
    ).toBe(widths[0] / 2 + gap + widths[1] / 2)
  })
})

function previewItem(): AutomationFormatPreviewItem {
  const first = {
    ...defaultAutomationTextItem({ id: "first" }),
    textMode: "static" as const,
    staticText: "First text",
    font: "Arial",
    fontSize: "16px",
    textStyle: "yellowText",
    textPosition: "bottom" as const,
    textItemWidth: "80%",
    textAlign: "right" as const,
    textAnchor: "flush" as const,
  }
  const second = {
    ...defaultAutomationTextItem({ id: "second" }),
    textMode: "static" as const,
    staticText: "Second text",
  }
  return {
    id: "content-1",
    role: "content",
    tab: "Content",
    label: "Content 1",
    section: {
      id: "body",
      image_url: "",
      textItems: [first, second],
      aspect_ratio: "1:1",
      imageGrid: "none",
      slideCount: 1,
      noText: false,
      overlay: true,
      overlayImage: { enabled: true, collectionId: "overlay", padding: 12 },
    },
    image: { id: "base", imageUrl: "/base.jpg" } as never,
    images: [],
    overlayImages: [{ id: "overlay", imageUrl: "/overlay.jpg" } as never],
    text: "First text",
    textItem: first,
    textItems: [first, second],
  }
}

describe("slideshow format preview controls", () => {
  it("creates added text in the same layout region as the previous item", () => {
    const previous = defaultAutomationTextItem({
      fontSize: "22px",
      textStyle: "outline",
      font: "Bebas Neue",
      textPosition: "bottom",
      textItemWidth: "80%",
      textAlign: "left",
      textAnchor: "flush",
      textVerticalAnchor: "flush",
    })

    expect(newAutomationTextItemAfter(previous)).toMatchObject({
      fontSize: "22px",
      textStyle: "outline",
      font: "Bebas Neue",
      textPosition: "bottom",
      textItemWidth: "80%",
      textAlign: "left",
      textAnchor: "flush",
      textVerticalAnchor: "flush",
    })
  })

  it("maps overlay, aspect ratio, overlay image, and padding into the canvas slide", () => {
    const slide = previewSlideshowSlide(previewItem(), 0)
    expect(slide).toMatchObject({
      aspect_ratio: "1:1",
      overlay: true,
      overlayImage: { image_url: "/overlay.jpg", padding: 12 },
    })
  })

  it("renders every configured text element with its visual controls", () => {
    const items = previewSlideshowTextItems(previewItem())
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: "first",
      text: "First text",
      font: "Arial",
      fontSize: "16px",
      textStyle: "yellowText",
      textAlign: "right",
      textAnchor: "flush",
      textPlacement: "bottom",
      textSize: { width: 80 },
    })
    expect(items[1]).toMatchObject({ id: "second", text: "Second text" })
  })

  it("places flush left and right alignment at the actual canvas edges", () => {
    const item = previewItem()
    item.textItems[0] = {
      ...item.textItems[0],
      textAlign: "left",
      textAnchor: "flush",
    }
    item.section.textItems = item.textItems
    expect(previewSlideshowTextItems(item)[0].textPosition.x).toBe(1.5)

    item.textItems[0] = { ...item.textItems[0], textAlign: "right" }
    item.section.textItems = item.textItems
    expect(previewSlideshowTextItems(item)[0].textPosition.x).toBe(98.5)
  })

  it("updates only the selected text item", () => {
    const item = previewItem()
    const schema = { formatting: [item.section] } as AutomationSchema
    const updated = updateAutomationTextItemAt(schema, "content", 1, {
      textAlign: "right",
      fontSize: "22px",
    })
    const section = updated.formatting.find((entry) => entry.id === "body")
    if (!section) throw new Error("Missing body")

    expect(section.textItems[0]).toEqual(item.textItems[0])
    expect(section.textItems[1]).toMatchObject({
      id: "second",
      textAlign: "right",
      fontSize: "22px",
    })
  })

  it("removes all text from the canvas when Display text is off", () => {
    const item = previewItem()
    item.section.noText = true
    expect(previewSlideshowTextItems(item)).toEqual([])
  })
})
