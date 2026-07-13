import { describe, expect, it } from "vitest"

import {
  selectSlideshowImageWithAi,
  slideshowImageMatchingPayload,
} from "./slideshow-image-matching"

describe("slideshow AI image matching", () => {
  it("sends finalized slide text and every available candidate", () => {
    const payload = slideshowImageMatchingPayload({
      slideText: "three ways to create a calmer bathroom",
      candidates: [
        {
          id: "image-a",
          imageUrl: "https://example.com/a.jpg",
          caption: "minimal bathroom with warm wood",
        },
        {
          id: "image-b",
          imageUrl: "https://example.com/b.jpg",
          caption: "bright red sports car",
        },
      ],
    })

    const content = JSON.stringify(payload.messages[1].content)
    expect(content).toContain("three ways to create a calmer bathroom")
    expect(content).toContain("image-a")
    expect(content).toContain("image-b")
    expect(content).toContain('"type":"image_url"')
    expect(
      payload.response_format.json_schema.schema.properties.selectedImageId.enum
    ).toEqual(["image-a", "image-b"])
  })

  it("returns only an id supplied in the candidate list", async () => {
    const selected = await selectSlideshowImageWithAi({
      slideText: "a calm bathroom",
      candidates: [
        { id: "bathroom", imageUrl: "/bathroom.jpg", caption: "bathroom" },
        { id: "car", imageUrl: "/car.jpg", caption: "sports car" },
      ],
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"selectedImageId":"bathroom"}' } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    })

    expect(selected).toBe("bathroom")
  })
})
