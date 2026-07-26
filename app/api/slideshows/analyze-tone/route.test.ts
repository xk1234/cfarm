import { afterEach, describe, expect, it, vi } from "vitest"

const transcribeMock = vi.hoisted(() => vi.fn())
const analyzeMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/slideshow-tone-analysis", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/slideshow-tone-analysis")
  >("@/lib/slideshow-tone-analysis")
  return {
    ...actual,
    transcribeTikTokSlideshow: transcribeMock,
    analyzeSlideshowTone: analyzeMock,
  }
})

import { POST } from "./route"

afterEach(() => {
  transcribeMock.mockReset()
  analyzeMock.mockReset()
})

describe("POST /api/slideshows/analyze-tone", () => {
  it("rejects TikTok video posts without trying transcription", async () => {
    const response = await POST(
      request("https://www.tiktok.com/@lumenclip/video/7662360324313517330")
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/photo slideshow/)
    expect(transcribeMock).not.toHaveBeenCalled()
  })

  it("returns the caption fallback warning when OpenRouter is missing", async () => {
    transcribeMock.mockResolvedValue({
      postId: "7662360324313517330",
      url: "https://www.tiktok.com/@lumenclip/photo/7662360324313517330",
      authorUsername: "lumenclip",
      caption: "Caption fallback",
      hashtags: [],
      publishedAt: "2026-07-14T12:31:26.000Z",
      slides: [{ index: 1, text: "Caption fallback" }],
      transcriptionFallback: true,
    })
    analyzeMock.mockRejectedValue(new Error("missing key"))

    const response = await POST(
      request("https://www.tiktok.com/@lumenclip/photo/7662360324313517330")
    )
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.warning).toMatch(/not a full transcription/)
    expect(payload.transcript.transcriptionFallback).toBe(true)
  })
})

function request(url: string) {
  return new Request("http://localhost/api/slideshows/analyze-tone", {
    method: "POST",
    body: JSON.stringify({ url }),
  })
}
