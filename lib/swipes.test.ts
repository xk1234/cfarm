import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"

import { enrichSwipeAnalysis, type SwipePayload } from "./swipes"

const originalFetch = globalThis.fetch
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  process.env.OPENROUTER_API_KEY = originalOpenRouterKey
  vi.restoreAllMocks()
})

describe("enrichSwipeAnalysis", () => {
  test("uses Whisper for transcript and Gemini only for analysis", async () => {
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
})
