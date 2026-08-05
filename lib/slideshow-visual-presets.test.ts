import { describe, expect, it } from "vitest"

import {
  defaultAutomationTextItem,
  type AutomationFormatSection,
} from "@/lib/realfarm-automation"
import { slideshowTextItem } from "@/lib/slideshow-plan-core"
import { renderedSlideSvg, slideDimensions } from "@/lib/slideshow-renderer"
import {
  applySlideshowVisualPreset,
  slideshowVisualPresets,
} from "@/lib/slideshow-visual-presets"

function section(): AutomationFormatSection {
  return {
    id: "hook",
    aspect_ratio: "4:5",
    imageGrid: "none",
    overlay: false,
    noText: false,
    slideCount: 1,
    textItems: [
      defaultAutomationTextItem({
        id: "existing-one",
        contentDirection: "Keep this direction",
      }),
      defaultAutomationTextItem({ id: "existing-two" }),
    ],
  }
}

describe("slideshow visual presets", () => {
  it("applies each locked layout while preserving matching content directions", () => {
    for (const preset of slideshowVisualPresets) {
      const result = applySlideshowVisualPreset(section(), preset)
      expect(result.visualPresetId).toBe(preset.id)
      expect(result.aspect_ratio).toBe(preset.section.aspect_ratio)
      expect(result.textItems).toHaveLength(preset.section.textItems.length)
      expect(result.textItems[0]?.id).toBe("existing-one")
      expect(result.textItems[0]?.contentDirection).toBe("Keep this direction")
    }
  })

  it("supports the reference landscape ratio", () => {
    expect(slideDimensions("4:3")).toEqual({ width: 1080, height: 810 })
  })

  it("carries exact positions and block-card styling into generated slides", () => {
    const item = slideshowTextItem(
      {
        id: "card",
        positionX: 62,
        positionY: 51,
        fontWeight: 500,
        backgroundMode: "block",
        backgroundRadius: 16,
        textStyle: "background",
        textItemWidth: "58%",
      },
      "how to avoid being rude as a tourist",
      { font: "Inter" },
      "hook"
    )

    expect(item.textPlacement).toBeUndefined()
    expect(item.textPosition).toEqual({ x: 62, y: 51 })

    const svg = renderedSlideSvg(
      {
        id: "slide",
        image_url: "",
        textItems: [item],
      },
      "data:image/png;base64,AA==",
      undefined,
      { aspectRatio: "4:5", font: "Inter" }
    )
    expect(svg.match(/data-text-background=/g)).toHaveLength(1)
    expect(svg).toContain('rx="16"')
    expect(svg).toContain('font-weight="500"')
  })

  it("wraps the white caption preset around each rendered line", () => {
    const preset = slideshowVisualPresets.find(
      (candidate) => candidate.id === "white-caption-card"
    )
    expect(preset).toBeDefined()

    const configured = applySlideshowVisualPreset(section(), preset!)
    const item = slideshowTextItem(
      configured.textItems[0]!,
      "how to avoid being rude as a tourist in italy",
      { font: "Inter" },
      "hook"
    )
    const svg = renderedSlideSvg(
      { id: "slide", image_url: "", textItems: [item] },
      "data:image/png;base64,AA==",
      undefined,
      { aspectRatio: configured.aspect_ratio, font: "Inter" }
    )

    expect(configured.textItems[0]?.backgroundMode).toBe("line")
    expect(svg.match(/data-text-background-line=/g)?.length).toBeGreaterThan(1)
    expect(svg).toContain("data-text-background-connector=")
  })
})
