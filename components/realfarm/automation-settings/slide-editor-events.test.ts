import { describe, expect, it, vi } from "vitest"

import { clickTargetsSlideshowTextEditor } from "./slide-editor-events"

describe("clickTargetsSlideshowTextEditor", () => {
  it("keeps canvas text clicks from falling through to slide selection", () => {
    const closest = vi.fn(() => ({}) as Element)

    expect(
      clickTargetsSlideshowTextEditor({ closest } as unknown as EventTarget)
    ).toBe(true)
    expect(closest).toHaveBeenCalledWith("[data-slideshow-text-editor]")
  })

  it("allows ordinary slide clicks to select the design inspector", () => {
    expect(
      clickTargetsSlideshowTextEditor({
        closest: () => null,
      } as unknown as EventTarget)
    ).toBe(false)
  })
})
