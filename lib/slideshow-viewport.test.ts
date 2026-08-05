import { describe, expect, it } from "vitest"

import {
  clampSlideTransform,
  fitSlideToViewport,
  MAX_SLIDE_ZOOM,
  MIN_SLIDE_ZOOM,
  zoomSlideAroundPoint,
} from "@/lib/slideshow-viewport"

describe("fitSlideToViewport", () => {
  it("fits a portrait slide by height without changing its aspect ratio", () => {
    const fitted = fitSlideToViewport(
      { width: 900, height: 500 },
      { width: 1080, height: 1350 }
    )

    expect(fitted).toEqual({ width: 400, height: 500 })
  })

  it("fits a landscape slide by width without changing its aspect ratio", () => {
    const fitted = fitSlideToViewport(
      { width: 600, height: 700 },
      { width: 1600, height: 900 }
    )

    expect(fitted.width).toBe(600)
    expect(fitted.height).toBeCloseTo(337.5)
  })
})

describe("slide viewport transforms", () => {
  const stage = { width: 400, height: 500 }

  it("does not allow panning when the slide is fitted at 100%", () => {
    expect(clampSlideTransform({ zoom: 1, x: 300, y: -300 }, stage)).toEqual({
      zoom: 1,
      x: 0,
      y: 0,
    })
  })

  it("allows the complete slide frame to shrink to 50%", () => {
    expect(clampSlideTransform({ zoom: 0.2, x: 300, y: -300 }, stage)).toEqual({
      zoom: MIN_SLIDE_ZOOM,
      x: 0,
      y: 0,
    })
  })

  it("keeps a zoomed slide within its visible pan bounds", () => {
    expect(clampSlideTransform({ zoom: 2, x: 900, y: -900 }, stage)).toEqual({
      zoom: 2,
      x: 200,
      y: -250,
    })
  })

  it("zooms around the pointer instead of jumping to the center", () => {
    const transformed = zoomSlideAroundPoint(
      { zoom: 1, x: 0, y: 0 },
      2,
      { x: 100, y: -50 },
      stage
    )

    expect(transformed).toEqual({ zoom: 2, x: -100, y: 50 })
  })

  it("caps extreme zoom requests", () => {
    expect(
      zoomSlideAroundPoint({ zoom: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }, stage)
        .zoom
    ).toBe(MAX_SLIDE_ZOOM)
  })
})
