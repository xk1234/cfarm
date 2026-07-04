import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"

import type { SwipePayload } from "./swipes"

const originalFetch = globalThis.fetch
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY
const originalCwd = process.cwd()

afterEach(() => {
  globalThis.fetch = originalFetch
  process.env.OPENROUTER_API_KEY = originalOpenRouterKey
  process.chdir(originalCwd)
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("enrichSwipeAnalysis", () => {
  test("uses Whisper for transcript and Gemini only for analysis", async () => {
    const { enrichSwipeAnalysis } = await import("./swipes")
    process.env.OPENROUTER_API_KEY = "test-openrouter-key"
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "swipe-media-"))
    const mediaPath = path.join(tempDir, "ad.mp4")
    await writeFile(mediaPath, Buffer.from("fake mp4 bytes"))

    const payload = {
      format: "video",
      title: "Bag ad",
      caption: "Visible caption",
      analyticsText: "Analytics text should not become the transcript when Whisper succeeds",
    } satisfies SwipePayload

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "Real whispered transcript" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    core_ugc_aesthetic_analysis: {
                      implied_device_and_capture: {
                        inferred_device: "smartphone",
                        confidence: "medium",
                        justification: {
                          aspect_ratio: "9:16",
                          lens_distortion: "unknown",
                          dynamic_range: "unknown",
                          visible_artifacts: [],
                        },
                      },
                      social_context_and_scenario: {
                        scenario: "product demo",
                        real_world_activity: "showing a bag",
                        setting: "unknown",
                        filming_context: "handheld",
                      },
                      visual_authenticity_cues: {
                        framing_and_composition: [],
                        camera_motion: [],
                        lighting: [],
                        editing: [],
                        visual_noise: [],
                      },
                      audio_authenticity_cues: {
                        background_sound: [],
                        dialogue_quality: [],
                        microphone_characteristics: "unknown",
                      },
                      subject_and_performance: {
                        appearance: {
                          general_age_range: "unknown",
                          style: "casual",
                          notable_features: [],
                        },
                        delivery_and_kinesics: {
                          speaking_style: "unknown",
                          tone: "unknown",
                          filler_words: [],
                          eye_contact: "unknown",
                          gestures: [],
                          body_language: "unknown",
                        },
                      },
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )

    globalThis.fetch = fetchMock

    const result = await enrichSwipeAnalysis(payload, {
      sourceVideoUrl: "https://example.com/ad.mp4",
      media: {
        filePath: mediaPath,
        format: "mp4",
        publicUrl: "/api/swipes/assets/ad.mp4",
      },
    })

    expect(result.full_script_transcription.full_text).toBe("Real whispered transcript")
    expect(result.core_ugc_aesthetic_analysis.social_context_and_scenario.scenario).toBe("product demo")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const transcriptionRequest = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/audio/transcriptions")
    expect(transcriptionRequest.model).toBe("openai/whisper-1")
    expect(transcriptionRequest.input_audio).toEqual({
      data: Buffer.from("fake mp4 bytes").toString("base64"),
      format: "mp4",
    })

    const analysisRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(analysisRequest.model).toBe("google/gemini-3-flash-preview")

    const analysisText = analysisRequest.messages[1].content[0].text as string
    expect(analysisText).toContain("Real whispered transcript")
    expect(analysisText).not.toContain("full_script_transcription")
  })

  test("createSwipe inserts a processing record before video analysis finishes", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "swipe-store-"))
    process.chdir(tempDir)
    process.env.OPENROUTER_API_KEY = "test-openrouter-key"
    vi.resetModules()
    const { createSwipe } = await import("./swipes")

    let releaseWhisper: ((response: Response) => void) | undefined
    const whisperResponse = new Promise<Response>((resolve) => {
      releaseWhisper = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(Buffer.from("fake mp4 bytes"), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "14" },
        }),
      )
      .mockReturnValueOnce(whisperResponse)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ core_ugc_aesthetic_analysis: {} }) } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
    globalThis.fetch = fetchMock

    const swipe = await createSwipe({
      advertiser: "TikTok Top Ads",
      platform: "tiktok-creative",
      source: "tiktok-creative",
      sourceUrl: "https://ads.tiktok.com/business/creativecenter/topads/123",
      title: "Processing video",
      caption: "Caption",
      format: "video",
      mediaUrl: "https://cdn.example.com/ad.mp4",
      metadata: {},
      stats: {},
      folder: "No Folder",
    })

    expect(swipe.processingStatus).toBe("processing")
    const dbPath = path.join(tempDir, "data", "swipes", "swipes.json")
    const initialRecords = JSON.parse(await readFile(dbPath, "utf8"))
    expect(initialRecords[0]).toMatchObject({
      id: swipe.id,
      processingStatus: "processing",
    })
    expect(initialRecords[0].mediaUrl).toMatch(/^\/api\/swipes\/assets\/swipe-.+-media\.mp4$/)
    expect(initialRecords[0].source_video_url).toBe(initialRecords[0].mediaUrl)

    releaseWhisper?.(
      new Response(JSON.stringify({ text: "Whisper transcript" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    await waitFor(async () => {
      const records = JSON.parse(await readFile(dbPath, "utf8"))
      expect(records[0]).toMatchObject({
        id: swipe.id,
        processingStatus: "complete",
        full_script_transcription: {
          full_text: "Whisper transcript",
        },
      })
    })
  })

  test("persists landing page screenshots separately from the source screenshot", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "swipe-store-"))
    process.chdir(tempDir)
    vi.resetModules()
    const { createSwipe } = await import("./swipes")

    const onePixelPng = "data:image/png;base64,iVBORw0KGgo="
    const swipe = await createSwipe({
      advertiser: "Facebook",
      platform: "facebook",
      source: "facebook",
      sourceUrl: "https://www.facebook.com/ads/library/",
      title: "Image ad",
      caption: "Caption",
      format: "image",
      screenshotDataUrl: onePixelPng,
      landingPageMobileScreenshotDataUrl: onePixelPng,
      landingPageDesktopScreenshotDataUrl: onePixelPng,
      metadata: {},
      stats: {},
      folder: "No Folder",
    })

    expect(swipe.landingPageMobileScreenshotPath).toMatch(/^\/api\/swipes\/assets\/swipe-.+-landing-mobile\.png$/)
    expect(swipe.landingPageDesktopScreenshotPath).toMatch(/^\/api\/swipes\/assets\/swipe-.+-landing-desktop\.png$/)
    expect(swipe.processingStatus).toBe("complete")

    const records = JSON.parse(await readFile(path.join(tempDir, "data", "swipes", "swipes.json"), "utf8"))
    expect(records[0].landingPageMobileScreenshotPath).toBe(swipe.landingPageMobileScreenshotPath)
    expect(records[0].landingPageDesktopScreenshotPath).toBe(swipe.landingPageDesktopScreenshotPath)
  })

  test("does not persist duplicate remote URL metadata fields", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "swipe-store-"))
    process.chdir(tempDir)
    vi.resetModules()
    const { createSwipe } = await import("./swipes")

    const swipe = await createSwipe({
      advertiser: "Facebook",
      platform: "facebook",
      source: "facebook",
      sourceUrl: "https://www.facebook.com/ads/library/",
      landingPageUrl: "https://example.com/landing",
      title: "Image ad",
      caption: "Caption",
      format: "image",
      metadata: {
        URL: "https://www.facebook.com/ads/library/",
        "Analytics URL": "https://www.facebook.com/ads/library/",
        Format: "image",
      },
      stats: {},
      folder: "No Folder",
    })

    expect(swipe.sourceUrl).toBe("https://www.facebook.com/ads/library/")
    expect(swipe.landingPageUrl).toBe("https://example.com/landing")
    expect(swipe.metadata).toEqual({ Format: "image" })
    const records = JSON.parse(await readFile(path.join(tempDir, "data", "swipes", "swipes.json"), "utf8"))
    expect(records[0].metadata).toEqual({ Format: "image" })
  })

  test("does not persist remote media fields when media download fails", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "swipe-store-"))
    process.chdir(tempDir)
    vi.resetModules()
    const { createSwipe } = await import("./swipes")
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }))

    const swipe = await createSwipe({
      advertiser: "TikTok",
      platform: "tiktok",
      source: "tiktok",
      sourceUrl: "https://www.tiktok.com/@creator/video/123",
      title: "Remote video",
      caption: "Caption",
      format: "video",
      mediaUrl: "https://cdn.tiktok.com/video.mp4",
      source_video_url: "https://cdn.tiktok.com/source.mp4",
      metadata: {},
      stats: {},
      folder: "No Folder",
    })

    expect(swipe.mediaUrl).toBeUndefined()
    expect(swipe.source_video_url).toBeUndefined()
    const records = JSON.parse(await readFile(path.join(tempDir, "data", "swipes", "swipes.json"), "utf8"))
    expect(records[0].mediaUrl).toBeUndefined()
    expect(records[0].source_video_url).toBeUndefined()
  })
})

async function waitFor(assertion: () => Promise<void> | void) {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1000) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  throw lastError
}
