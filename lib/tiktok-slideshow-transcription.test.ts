import { describe, expect, it } from "vitest"

import {
  normalizeTikTokSlideshowUrls,
  tiktokPublishedAt,
} from "./tiktok-slideshow-transcription"

describe("TikTok slideshow transcription", () => {
  it("normalizes and deduplicates TikTok photo URLs", () => {
    expect(
      normalizeTikTokSlideshowUrls([
        "https://www.tiktok.com/@horoiq/photo/7662360324313517330?share=1",
        "https://www.tiktok.com/@horoiq/photo/7662360324313517330",
      ])
    ).toEqual(["https://www.tiktok.com/@horoiq/photo/7662360324313517330"])
    expect(() =>
      normalizeTikTokSlideshowUrls([
        "https://www.tiktok.com/@horoiq/video/7662360324313517330",
      ])
    ).toThrow(/photo slideshow/)
  })

  it("derives the publication time encoded in a TikTok id", () => {
    expect(tiktokPublishedAt("7662360324313517330")).toBe(
      "2026-07-14T12:31:26.000Z"
    )
  })
})
