import { describe, expect, it } from "vitest"

import {
  generateSlideRendererStressCases,
  generateSlideshowSettingComparisons,
} from "@/lib/slide-renderer-experiments"

describe("slide renderer experiments", () => {
  it("creates 50 deterministic renderer-backed stress cases", () => {
    const cases = generateSlideRendererStressCases(50, 12345)
    const repeated = generateSlideRendererStressCases(50, 12345)

    expect(cases).toHaveLength(50)
    expect(repeated).toEqual(cases)
    expect(
      cases.every((item) => item.previewUrl.startsWith("data:image/svg+xml"))
    ).toBe(true)
  })

  it("varies the visual settings across the generated grid", () => {
    const cases = generateSlideRendererStressCases(50, 67890)

    expect(new Set(cases.map((item) => item.aspectRatio)).size).toBe(3)
    expect(
      new Set(cases.map((item) => item.settings.font)).size
    ).toBeGreaterThan(3)
    expect(new Set(cases.map((item) => item.wordCount)).size).toBeGreaterThan(
      20
    )
    expect(cases.some((item) => item.settings.overlay)).toBe(true)
    expect(cases.some((item) => !item.settings.overlay)).toBe(true)
    expect(cases.some((item) => item.settings.overlayImage)).toBe(true)
    expect(cases.some((item) => item.settings.textItems.length > 1)).toBe(true)
  })

  it("uses collection images for every experimental renderer case", () => {
    const imageSources = ["one", "two", "three"].map((id) => ({
      url: `/collections/${id}.jpg`,
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    }))
    const cases = generateSlideRendererStressCases(50, 67890, imageSources)
    const collectionUrls = new Set(imageSources.map((source) => source.url))

    expect(cases).toHaveLength(50)
    expect(
      cases.every((item) => collectionUrls.has(item.settings.imageUrl))
    ).toBe(true)
  })

  it("documents every setting group with renderer-backed value previews", () => {
    const settings = generateSlideshowSettingComparisons()

    expect(settings).toHaveLength(14)
    expect(settings.map((setting) => setting.id)).toEqual(
      expect.arrayContaining([
        "aspect-ratio",
        "image-fitting",
        "overlay-image",
        "text-style",
        "text-size",
        "text-position",
        "horizontal-padding",
      ])
    )
    expect(
      settings.every((setting) =>
        ["renderer", "fixed"].includes(setting.impact)
      )
    ).toBe(true)
    expect(
      settings.every((setting) =>
        setting.values.every((value) =>
          value.previewUrls.every((url) => url.startsWith("data:image/svg+xml"))
        )
      )
    ).toBe(true)
    expect(
      settings.every((setting) =>
        setting.values.every(
          (value) =>
            value.slideshow.settings.aspect_ratio &&
            value.slideshow.settings.font &&
            value.slideshow.images.length === value.previewUrls.length
        )
      )
    ).toBe(true)
  })

  it("uses collection images across every atlas slideshow document", () => {
    const imageSources = ["one", "two", "three"].map((id) => ({
      url: `/collections/${id}.jpg`,
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    }))
    const settings = generateSlideshowSettingComparisons(imageSources)
    const collectionUrls = new Set(imageSources.map((source) => source.url))

    expect(
      settings.every((setting) =>
        setting.values.every((value) =>
          value.slideshow.images.every((slide) =>
            collectionUrls.has(slide.image_url)
          )
        )
      )
    ).toBe(true)
  })
})
