import { describe, expect, it } from "vitest"

import type { AutomationRunRecord } from "./automation-runner"
import {
  candidateForPost,
  normalizeTikTokUrls,
  tiktokPublishedAt,
} from "./tiktok-publication-import"

describe("TikTok publication imports", () => {
  it("normalizes and deduplicates TikTok photo URLs", () => {
    expect(
      normalizeTikTokUrls([
        "https://www.tiktok.com/@horoiq/photo/7662360324313517330?share=1",
        "https://www.tiktok.com/@horoiq/photo/7662360324313517330",
      ])
    ).toEqual(["https://www.tiktok.com/@horoiq/photo/7662360324313517330"])
    expect(() =>
      normalizeTikTokUrls([
        "https://www.tiktok.com/@horoiq/video/7662360324313517330",
      ])
    ).toThrow(/photo slideshow/)
  })

  it("derives the publication time encoded in a TikTok id", () => {
    expect(tiktokPublishedAt("7662360324313517330")).toBe(
      "2026-07-14T12:31:26.000Z"
    )
  })

  it("ranks a matching caption, hook, slide count, and nearby run highly", () => {
    const candidate = candidateForPost(
      {
        caption:
          "The tiny things that make a Virgo's eye twitch without them ever saying a word.",
        hookText: "7 things that annoy virgo",
        photoCount: 9,
        publishedAt: "2026-07-17T17:10:31.000Z",
      },
      run({
        hook: "7 things that annoy virgo",
        caption:
          "The tiny things that make a Virgo's eye twitch without them ever saying a word.",
        slideCount: 9,
        createdAt: "2026-07-17T17:06:00.838Z",
      })
    )

    expect(candidate).toMatchObject({
      runId: "run-1",
      confidence: "high",
      slideCount: 9,
    })
    expect(candidate?.score).toBeGreaterThanOrEqual(0.85)
  })

  it("never offers failed generations as match candidates", () => {
    expect(
      candidateForPost(
        {
          caption: "Same caption",
          hookText: "Same hook",
          photoCount: 1,
          publishedAt: "2026-07-17T17:10:31.000Z",
        },
        { ...run({}), status: "failed" }
      )
    ).toBeNull()
  })
})

function run(
  input: {
    hook?: string
    caption?: string
    slideCount?: number
    createdAt?: string
  } = {}
): AutomationRunRecord {
  const slideCount = input.slideCount ?? 1
  const createdAt = input.createdAt ?? "2026-07-17T17:00:00.000Z"
  return {
    id: "run-1",
    automationId: "automation-1",
    automationTitle: "Astrology Informational",
    scheduledFor: createdAt,
    status: "succeeded",
    slideshowId: "slideshow-1",
    plan: {
      title: "Generated slideshow",
      caption: input.caption ?? "Generated caption",
      hashtags: "#astrology",
      hook: input.hook ?? "Generated hook",
      imageCollectionIds: [],
      slides: Array.from({ length: slideCount }, (_, index) => ({
        id: `slide-${index + 1}`,
        role: index === 0 ? "hook" : "content",
        imageUrl: `https://example.com/${index + 1}.jpg`,
        imageCaption: `Slide ${index + 1}`,
        text: `Slide ${index + 1}`,
        textPlacement: "center",
        aspectRatio: "9:16",
        overlay: false,
        displayText: true,
        textItems: [],
      })),
      slideCount: { mode: "static", count: slideCount },
      publishType: "slideshow",
      autoMusic: false,
      autoPost: false,
      language: "English",
    },
    createdAt,
    updatedAt: createdAt,
  }
}
