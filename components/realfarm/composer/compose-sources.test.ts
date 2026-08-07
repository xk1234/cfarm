import { describe, expect, it } from "vitest"

import {
  composerSourcesFromRuns,
  composerValueFromSources,
} from "./compose-sources"

describe("composerSourcesFromRuns", () => {
  it("normalizes visual and text template outputs", () => {
    const sources = composerSourcesFromRuns({
      templateRuns: [
        {
          id: "slides-1",
          automationId: "template-slides",
          automationTitle: "Astrology slideshow",
          status: "completed",
          createdAt: "2026-08-07T02:00:00.000Z",
          renderedSlides: [
            { imageUrl: "https://example.com/1.png", text: "Slide one" },
            { imageUrl: "https://example.com/2.png", text: "Slide two" },
          ],
          plan: { title: "Cancer", caption: "Generated caption" },
        },
      ],
      socialRuns: [
        {
          id: "x-1",
          automationId: "template-x",
          automationName: "X authority post",
          platform: "x",
          status: "draft",
          createdAt: "2026-08-07T01:00:00.000Z",
          posts: [{ text: "First post" }, { text: "Second post" }],
          imageUrls: [],
        },
      ],
    })

    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({
      id: "slides-1",
      kind: "slideshow",
      text: "Generated caption",
    })
    expect(sources[0].media).toHaveLength(2)
    expect(sources[1]).toMatchObject({
      id: "x-1",
      kind: "text",
      text: "First post\n\nSecond post",
    })
  })

  it("combines multiple selected outputs without duplicate media", () => {
    const [source] = composerSourcesFromRuns({
      templateRuns: [
        {
          id: "slides-1",
          automationId: "template-slides",
          automationTitle: "Template",
          createdAt: "2026-08-07T00:00:00.000Z",
          outputImages: ["https://example.com/1.png"],
          plan: { caption: "Caption" },
        },
      ],
    })

    const value = composerValueFromSources([source, source])
    expect(value.sourceOutputIds).toEqual(["slides-1"])
    expect(value.base.media).toHaveLength(1)
    expect(value.base.text).toBe("Caption")
  })
})
