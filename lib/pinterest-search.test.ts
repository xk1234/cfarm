import { describe, expect, it } from "vitest"

import {
  PINTEREST_ACTOR_ID,
  PINTEREST_BOARD_ACTOR_ID,
  buildPinterestActorInput,
  buildPinterestBoardActorInput,
  createFallbackPinterestResults,
  normalizePinterestItems,
  isPinterestBoardUrl,
} from "./pinterest-search"

describe("pinterest search helpers", () => {
  it("uses the API-resolvable all-in-one Pinterest scraper actor", () => {
    expect(PINTEREST_ACTOR_ID).toBe("fatihtahta/pinterest-scraper-search")
  })

  it("uses the working board-specific Pinterest actor", () => {
    expect(PINTEREST_BOARD_ACTOR_ID).toBe("dltik/pinterest-scraper")
  })

  it("builds a bounded actor input for keyword pin search", () => {
    expect(buildPinterestActorInput("wolf of wall street", 20)).toEqual({
      queries: ["wolf of wall street"],
      type: "all-pins",
      limit: 20,
      content_analysis: false,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    })
  })

  it("builds a board URL input for direct Pinterest board imports", () => {
    expect(
      buildPinterestActorInput(
        "https://www.pinterest.com/neilross49/tree/?foo=bar",
        20,
        "board"
      )
    ).toEqual({
      startUrls: ["https://www.pinterest.com/neilross49/tree/"],
      type: "all-pins",
      limit: 20,
      content_analysis: false,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    })
  })

  it("auto-detects Pinterest board URLs entered through search", () => {
    expect(
      isPinterestBoardUrl("https://www.pinterest.com/borsatochiara/bagno/")
    ).toBe(true)
    expect(isPinterestBoardUrl("https://www.pinterest.com/pin/123/")).toBe(
      false
    )
    expect(isPinterestBoardUrl("bathroom inspiration")).toBe(false)
  })

  it("builds the board actor payload for the working provider", () => {
    expect(
      buildPinterestBoardActorInput(
        "https://www.pinterest.com/borsatochiara/bagno/?foo=bar",
        20
      )
    ).toEqual({
      mode: "board",
      inputs: ["https://www.pinterest.com/borsatochiara/bagno/"],
      maxResults: 20,
      scope: "pins",
      includeAiAnalysis: false,
      proxyConfig: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    })
  })

  it("requests a minimum actor batch without changing the caller result limit", () => {
    expect(buildPinterestActorInput("small batch", 3).limit).toBe(10)
    expect(buildPinterestBoardActorInput("user/board", 3).maxResults).toBe(3)
  })

  it("normalizes nested Pinterest pin media into collection results", () => {
    const results = normalizePinterestItems([
      {
        id: "123",
        title: "Trading floor",
        url: "https://www.pinterest.com/pin/123/",
        pin: {
          description: "A busy trading floor scene",
          dominant_color: "#8e4a2c",
        },
        media: {
          images: {
            orig: {
              url: "https://i.pinimg.com/originals/example.jpg",
              width: 736,
              height: 1104,
            },
          },
        },
      },
    ])

    expect(results).toEqual([
      {
        id: "123",
        title: "Trading floor",
        description: "A busy trading floor scene",
        imageUrl: "https://i.pinimg.com/originals/example.jpg",
        sourceUrl: "https://www.pinterest.com/pin/123/",
        dominantColor: "#8e4a2c",
        width: 736,
        height: 1104,
      },
    ])
  })

  it("normalizes image_by_size media into collection results", () => {
    const results = normalizePinterestItems([
      {
        id: "456",
        source_url: "https://www.pinterest.com/search/pins/?q=movie",
        pin: {
          title: "Movie scene",
          closeup_unified_description: "A cinematic frame",
          dominant_color: "#343434",
        },
        media: {
          images: {
            images_by_size: {
              "736x": {
                url: "https://i.pinimg.com/736x/example.jpg",
                width: 736,
                height: 981,
              },
            },
          },
        },
      },
    ])

    expect(results).toEqual([
      {
        id: "456",
        title: "Movie scene",
        description: "A cinematic frame",
        imageUrl: "https://i.pinimg.com/736x/example.jpg",
        sourceUrl: "https://www.pinterest.com/search/pins/?q=movie",
        dominantColor: "#343434",
        width: 736,
        height: 981,
      },
    ])
  })

  it("normalizes board actor pin fields", () => {
    const results = normalizePinterestItems([
      {
        type: "pin",
        pin_id: "461337555600019159",
        url: "https://www.pinterest.com/pin/461337555600019159/",
        title: "",
        description: "",
        alt_text: "a bathroom with wooden shelves",
        image_url: "https://i.pinimg.com/originals/b2/af/6b/example.jpg",
        image_width: 474,
        image_height: 710,
        dominant_color: "#b7a38e",
      },
    ])

    expect(results[0]).toMatchObject({
      id: "461337555600019159",
      description: "a bathroom with wooden shelves",
      imageUrl: "https://i.pinimg.com/originals/b2/af/6b/example.jpg",
      dominantColor: "#b7a38e",
    })
  })

  it("recovers deeply nested pinimg urls from changing actor payloads", () => {
    const results = normalizePinterestItems([
      {
        id: "789",
        payload: {
          unexpected: {
            image:
              "https:\\/\\/i.pinimg.com\\/originals\\/aa\\/bb\\/fallback.jpg",
          },
        },
      },
    ])

    expect(results[0]?.imageUrl).toBe(
      "https://i.pinimg.com/originals/aa/bb/fallback.jpg"
    )
  })

  it("creates deterministic fallback results for local testing", () => {
    const results = createFallbackPinterestResults("soccer hooks", 3)

    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({
      id: "fallback-soccer-hooks-1",
      title: "soccer hooks 1",
      sourceUrl: "https://www.pinterest.com/search/pins/?q=soccer%20hooks",
    })
  })
})
