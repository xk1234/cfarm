import { describe, expect, it, vi } from "vitest"

import { synthesizeElevenLabsSpeech } from "@/lib/elevenlabs-tts"

describe("ElevenLabs TTS", () => {
  it("normalizes character alignment into words", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      audio_base64: Buffer.from("audio").toString("base64"),
      alignment: { characters: ["h", "i", " ", "a"], character_start_times_seconds: [0, .1, .2, .3], character_end_times_seconds: [.1, .2, .3, .4] },
    }), { status: 200, headers: { "content-type": "application/json" } }))
    const result = await synthesizeElevenLabsSpeech({ text: "hi a", voiceId: "voice", apiKey: "key", fetchImpl })
    expect(result.words).toEqual([{ word: "hi", startMs: 0, endMs: 200 }, { word: "a", startMs: 300, endMs: 400 }])
  })
})
