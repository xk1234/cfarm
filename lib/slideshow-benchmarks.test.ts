import { describe, expect, it } from "vitest"

import {
  benchmarkContextFromSlides,
  benchmarkInputHash,
  benchmarkSlidesFromSlideshow,
  nicheMatchedBenchmarkReferences,
  randomBenchmarkReferences,
  scoreSlideshowBenchmark,
} from "@/lib/slideshow-benchmarks"

describe("slideshow benchmarks", () => {
  it("selects unique random reference slideshows", () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      id: `reference-${index}`,
    }))
    const selected = randomBenchmarkReferences(records as never, 3, () => 0)

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

  it("builds generated benchmark context from the actual slide copy", () => {
    expect(
      benchmarkContextFromSlides({
        title: "Aquarius boundaries",
        slides: [
          { text: "why aquarius goes quiet" },
          { text: "they need time to process conflict" },
        ],
      })
    ).toBe(
      "Aquarius boundaries · Slide 1: why aquarius goes quiet · Slide 2: they need time to process conflict"
    )
  })

  it("changes the cache key when slide copy or rendered pixels change", () => {
    const input = {
      title: "Aquarius boundaries",
      icp: "astrology viewers",
      slides: [
        {
          id: "slide-1",
          imageUrl: "/rendered.png",
          text: "why aquarius goes quiet",
          role: "hook" as const,
        },
      ],
    }
    const original = benchmarkInputHash(input, [Buffer.from("pixels-a")])

    expect(
      benchmarkInputHash(
        {
          ...input,
          slides: [{ ...input.slides[0], text: "new slide copy" }],
        },
        [Buffer.from("pixels-a")]
      )
    ).not.toBe(original)
    expect(benchmarkInputHash(input, [Buffer.from("pixels-b")])).not.toBe(
      original
    )
  })

  it("sends ordered slide copy and rendered images to the benchmark model", async () => {
    let requestBody: Record<string, unknown> | undefined
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    )
    const fetchImpl: typeof fetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scores: {
                    hookVirality: 7,
                    pictureTextFit: 8,
                    usefulnessToIcp: 6,
                    conversationPotential: 5,
                  },
                  rationales: {
                    hookVirality: "clear hook",
                    pictureTextFit: "aligned visual",
                    usefulnessToIcp: "specific advice",
                    conversationPotential: "soft CTA",
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    await scoreSlideshowBenchmark({
      apiKey: "test-key",
      fetchImpl,
      title: "Aquarius boundaries",
      icp: "Aquarius boundaries · Slide 1: why aquarius goes quiet",
      slides: [
        {
          id: "hook",
          imageUrl: "/hook.png",
          text: "why aquarius goes quiet",
          role: "hook",
        },
        {
          id: "body",
          imageUrl: "/body.png",
          text: "they need time to process conflict",
          role: "content",
        },
      ],
      imageBytes: [image, image],
    })

    const messages = requestBody?.messages as Array<{
      role: string
      content: Array<{ type: string; text?: string }>
    }>
    const userContent = messages.find(
      (message) => message.role === "user"
    )?.content
    const sentText = userContent
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")

    expect(sentText).toContain("Stored text: why aquarius goes quiet")
    expect(sentText).toContain(
      "Stored text: they need time to process conflict"
    )
    expect(
      userContent?.filter((item) => item.type === "image_url")
    ).toHaveLength(2)
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
