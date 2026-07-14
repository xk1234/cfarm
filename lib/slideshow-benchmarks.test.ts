import { describe, expect, it } from "vitest"

import {
  benchmarkSlidesFromSlideshow,
  nicheMatchedBenchmarkReferences,
  randomBenchmarkReferences,
} from "@/lib/slideshow-benchmarks"

describe("slideshow benchmarks", () => {
  it("selects unique random reference slideshows", () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      id: `reference-${index}`,
    }))
    const selected = randomBenchmarkReferences(
      records as never,
      3,
      () => 0
    )

    expect(selected.map((item) => item.id)).toEqual([
      "reference-0",
      "reference-1",
      "reference-2",
    ])
    expect(new Set(selected.map((item) => item.id)).size).toBe(3)
  })

  it("prefers same-niche corpus references and fills the rest randomly", () => {
    const records = [
      corpusRecord("fitness-1", "fitness gym workouts"),
      corpusRecord("astro-1", "astrology zodiac compatibility"),
      corpusRecord("food-1", "cooking recipes kitchen"),
      corpusRecord("astro-2", "astrology horoscope readings"),
    ]

    const selected = nicheMatchedBenchmarkReferences(
      records as never,
      { icp: "astrology · website", title: "The Raw Truth About Aquarius" },
      3,
      () => 0
    )

    expect(selected.slice(0, 2).map((item) => item.id)).toEqual(
      expect.arrayContaining(["astro-1", "astro-2"])
    )
    expect(selected).toHaveLength(3)
    expect(new Set(selected.map((item) => item.id)).size).toBe(3)
  })

  it("passes every rendered slideshow slide and all of its text to grading", () => {
    const slides = benchmarkSlidesFromSlideshow({
      id: "slideshow-1",
      output_images: ["/hook.png", "/body.png", "/cta.png"],
      images: [
        slideshowSlide("hook", ["hook text"]),
        slideshowSlide("body-1", ["heading", "supporting copy"]),
        slideshowSlide("cta", ["follow for more"]),
      ],
    })

    expect(slides).toHaveLength(3)
    expect(slides.map((slide) => slide.role)).toEqual([
      "hook",
      "content",
      "cta",
    ])
    expect(slides[1].text).toBe("heading\nsupporting copy")
  })
})

function corpusRecord(id: string, niche: string) {
  return {
    id,
    icp: niche,
    creator: { niche },
    prompt: "",
  }
}

function slideshowSlide(id: string, text: string[]) {
  return {
    id,
    image_url: `/source-${id}.png`,
    textItems: text.map((value, index) => ({
      id: `${id}-text-${index}`,
      text: value,
    })),
  } as never
}
