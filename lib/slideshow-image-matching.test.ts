import { describe, expect, it } from "vitest"

import {
  deriveSlideVisualConcepts,
  imageShortlistSize,
  rankImageCandidates,
  selectSlideshowImageWithAi,
  slideshowImageMatchingPayload,
  type SlideshowImageCandidate,
} from "./slideshow-image-matching"

const candidate = (
  id: string,
  caption: string,
  imageUrl = `https://example.com/${id}.jpg`
): SlideshowImageCandidate => ({ id, imageUrl, caption })

const jsonResponse = (content: unknown) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  )

describe("visual concept derivation", () => {
  it("degrades to empty concepts instead of failing the generation", async () => {
    const concepts = await deriveSlideVisualConcepts({
      slideTexts: ["a", "b"],
      apiKey: "k",
      fetchImpl: async () => {
        throw new Error("provider down")
      },
    })
    expect(concepts).toEqual([[], []])
  })

  it("pads a short or malformed answer per slide", async () => {
    const concepts = await deriveSlideVisualConcepts({
      slideTexts: ["a", "b"],
      apiKey: "k",
      fetchImpl: async () =>
        jsonResponse('{"slides":[{"concepts":["crescent moon","night sky"]}]}'),
    })
    expect(concepts).toEqual([["crescent moon", "night sky"], []])
  })
})

describe("local candidate ranking", () => {
  const candidates = [
    candidate("car", "bright red sports car on a highway"),
    candidate("moon", "crescent moon over dark water at night"),
    candidate("plant", "green houseplant on a windowsill"),
  ]

  it("ranks by visual concepts rather than the slide's wording", () => {
    // The copy shares no vocabulary with any caption; only the concepts do.
    const ranked = rankImageCandidates({
      concepts: ["crescent moon", "dark water"],
      slideText: "she goes quiet for three days and says nothing",
      candidates,
      limit: 1,
    })
    expect(ranked.map((entry) => entry.id)).toEqual(["moon"])
  })

  it("weights a whole concept phrase above incidental word overlap", () => {
    const ranked = rankImageCandidates({
      concepts: ["red sports car"],
      candidates: [
        candidate("partial", "a car parked outside"),
        candidate("exact", "bright red sports car on a highway"),
      ],
      limit: 1,
    })
    expect(ranked[0].id).toBe("exact")
  })

  it("caps the shortlist and never returns nothing", () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      candidate(`img-${index}`, `caption ${index}`)
    )
    expect(rankImageCandidates({ concepts: [], candidates: many })).toHaveLength(
      imageShortlistSize
    )
    expect(
      rankImageCandidates({ concepts: ["nothing matches"], candidates: many })
    ).not.toHaveLength(0)
  })
})

describe("slideshow AI image matching", () => {
  it("selects by index and sends no enum, minimum or maximum", () => {
    // Anthropic's structured-output compiler rejects all three, and an enum of
    // every candidate id is what made this call fail on real collections.
    const payload = slideshowImageMatchingPayload({
      slideText: "three ways to create a calmer bathroom",
      concepts: ["minimal bathroom"],
      candidates: [
        candidate("image-a", "minimal bathroom with warm wood"),
        candidate("image-b", "bright red sports car"),
      ],
    })

    const content = JSON.stringify(payload.messages[1].content)
    expect(content).toContain("three ways to create a calmer bathroom")
    expect(content).toContain("minimal bathroom")
    expect(content).toContain("Candidate 0")
    // No image blocks: providers fetch those server-side and reject many hosts,
    // which failed the whole selection. Captions carry the signal instead.
    expect(content).not.toContain('"type":"image_url"')

    const schema = payload.response_format.json_schema.schema
    expect(schema.properties.selectedImageIndex).toEqual({ type: "integer" })
    expect(JSON.stringify(schema)).not.toContain("enum")
    expect(JSON.stringify(schema)).not.toContain("minimum")
    expect(JSON.stringify(schema)).not.toContain("maximum")
  })

  it("only sends the shortlist, not the whole collection", async () => {
    let sent = ""
    await selectSlideshowImageWithAi({
      slideText: "a calm bathroom",
      concepts: ["calm bathroom"],
      candidates: Array.from({ length: 200 }, (_, index) =>
        candidate(`img-${index}`, `caption ${index}`)
      ),
      apiKey: "k",
      fetchImpl: async (_url, init) => {
        sent = String((init as RequestInit).body)
        return jsonResponse('{"selectedImageIndex":0}')
      },
    })
    const blocks = (sent.match(/Candidate \d+:/g) ?? []).length
    expect(blocks).toBe(imageShortlistSize)
  })

  it("maps the chosen index back to the shortlisted id", async () => {
    const selected = await selectSlideshowImageWithAi({
      slideText: "a calm bathroom",
      concepts: ["sports car"],
      candidates: [
        candidate("bathroom", "bathroom"),
        candidate("car", "bright red sports car"),
      ],
      apiKey: "k",
      fetchImpl: async () => jsonResponse('{"selectedImageIndex":0}'),
    })
    // "sports car" concepts rank the car first, so index 0 is the car.
    expect(selected).toBe("car")
  })

  it("falls back to the top-ranked candidate on an out-of-range index", async () => {
    const selected = await selectSlideshowImageWithAi({
      slideText: "a calm bathroom",
      concepts: ["calm bathroom"],
      candidates: [
        candidate("bathroom", "calm bathroom with warm wood"),
        candidate("car", "bright red sports car"),
      ],
      apiKey: "k",
      fetchImpl: async () => jsonResponse('{"selectedImageIndex":99}'),
    })
    expect(selected).toBe("bathroom")
  })
})
