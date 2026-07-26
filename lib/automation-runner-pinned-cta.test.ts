import { describe, expect, it } from "vitest"

import { selectImagesForSlides } from "@/lib/automation-runner"

const ctaImageCollection = {
  id: "cta-collection",
  name: "CTA collection",
  createdAt: "2026-07-25T00:00:00.000Z",
  aliases: ["cta-collection"],
  images: [
    {
      image_link: "https://example.com/a.jpg",
      caption: "General collection image",
      hash: "image-a",
    },
    {
      image_link: "https://example.com/b.jpg",
      caption: "CTA asset: pinned CTA",
      hash: "image-b",
    },
  ],
}

function selectCtaImages(input: {
  ctaPinnedImageId: string
  recentImageUsage?: Map<string, string>
  random?: () => number
}) {
  return selectImagesForSlides({
    title: "CTA selection",
    hook: "Choose the CTA",
    images: [],
    imageCollections: [ctaImageCollection],
    specs: [
      {
        id: "cta-1",
        index: 0,
        section: "cta",
        title: "CTA",
        aspectRatio: "9:16",
        imageGrid: "none",
        overlay: false,
        displayText: false,
        collectionId: "cta-collection",
        textItems: [],
      },
    ],
    ...input,
  })
}

function selectFirstSlideImages(input: {
  firstSlidePinnedImageId: string
  recentImageUsage?: Map<string, string>
  random?: () => number
}) {
  return selectImagesForSlides({
    title: "First slide selection",
    hook: "Choose the hook image",
    images: [],
    imageCollections: [ctaImageCollection],
    specs: [
      {
        id: "hook-1",
        index: 0,
        section: "hook",
        title: "Hook",
        aspectRatio: "9:16",
        imageGrid: "none",
        overlay: false,
        displayText: true,
        collectionId: "cta-collection",
        textItems: [],
      },
    ],
    ...input,
  })
}

describe("automation runner pinned CTA image selection", () => {
  it("selects exactly the pinned CTA image by id", async () => {
    await expect(
      selectCtaImages({ ctaPinnedImageId: "image-b" })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("selects exactly the pinned CTA image by image URL", async () => {
    await expect(
      selectCtaImages({
        ctaPinnedImageId: "https://example.com/b.jpg",
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("falls back to the full CTA collection when the pinned image is missing", async () => {
    await expect(
      selectCtaImages({
        ctaPinnedImageId: "deleted-image",
        random: () => 0,
      })
    ).resolves.toMatchObject([{ id: "image-a" }])
  })

  it("selects a pinned CTA image even when it was used recently", async () => {
    await expect(
      selectCtaImages({
        ctaPinnedImageId: "image-b",
        recentImageUsage: new Map([["image-b", "2026-07-25T00:00:00.000Z"]]),
      })
    ).resolves.toMatchObject([
      {
        id: "image-b",
        reusedRecently: true,
        lastUsedAt: "2026-07-25T00:00:00.000Z",
      },
    ])
  })
})

describe("automation runner pinned first-slide image selection", () => {
  it("selects exactly the pinned first-slide image by id", async () => {
    await expect(
      selectFirstSlideImages({ firstSlidePinnedImageId: "image-b" })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("selects exactly the pinned first-slide image by image URL", async () => {
    await expect(
      selectFirstSlideImages({
        firstSlidePinnedImageId: "https://example.com/b.jpg",
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("falls back to the full first-slide collection when the pin is missing", async () => {
    await expect(
      selectFirstSlideImages({
        firstSlidePinnedImageId: "deleted-image",
        random: () => 0,
      })
    ).resolves.toMatchObject([{ id: "image-a" }])
  })

  it("selects a pinned first-slide image even when it was used recently", async () => {
    await expect(
      selectFirstSlideImages({
        firstSlidePinnedImageId: "image-b",
        recentImageUsage: new Map([["image-b", "2026-07-25T00:00:00.000Z"]]),
      })
    ).resolves.toMatchObject([
      {
        id: "image-b",
        reusedRecently: true,
        lastUsedAt: "2026-07-25T00:00:00.000Z",
      },
    ])
  })
})
