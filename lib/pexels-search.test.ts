import { describe, expect, it } from "vitest"

import {
  buildPexelsSearchUrl,
  createFallbackPexelsResults,
  normalizePexelsPhotos,
} from "./pexels-search"

describe("pexels search helpers", () => {
  it("builds a bounded Pexels search URL", () => {
    expect(buildPexelsSearchUrl("studio product", 250).toString()).toBe(
      "https://api.pexels.com/v1/search?query=studio+product&per_page=80&orientation=portrait"
    )
  })

  it("normalizes Pexels photos into collection search results", () => {
    const results = normalizePexelsPhotos([
      {
        id: 42,
        alt: "Person holding a product",
        photographer: "Ada Lovelace",
        url: "https://www.pexels.com/photo/42/",
        avg_color: "#997755",
        width: 1200,
        height: 1800,
        src: {
          large2x: "https://images.pexels.com/photos/42/large2x.jpeg",
          large: "https://images.pexels.com/photos/42/large.jpeg",
        },
      },
    ])

    expect(results).toEqual([
      {
        id: "pexels-42",
        title: "Person holding a product",
        description: "Person holding a product by Ada Lovelace",
        imageUrl: "https://images.pexels.com/photos/42/large2x.jpeg",
        sourceUrl: "https://www.pexels.com/photo/42/",
        dominantColor: "#997755",
        width: 1200,
        height: 1800,
      },
    ])
  })

  it("creates deterministic fallback results for local Pexels testing", () => {
    const results = createFallbackPexelsResults("desk setup", 2)

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      id: "pexels-fallback-desk-setup-1",
      title: "desk setup Pexels 1",
      sourceUrl: "https://www.pexels.com/search/desk%20setup/",
    })
  })
})
