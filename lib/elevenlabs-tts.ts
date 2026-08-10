import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { recordProviderRequest } from "@/lib/provider-request-trace"

export type WordTiming = { word: string; startMs: number; endMs: number }
type FetchLike = typeof fetch

export async function synthesizeElevenLabsSpeech(input: {
  text: string
  voiceId: string
  apiKey: string
  modelId?: string
  outputFormat?: string
  voiceSettings?: Record<string, number | boolean>
  endpoint?: string
  fetchImpl?: FetchLike
}): Promise<{
  audio: Uint8Array
  contentType: string
  durationMs?: number
  words: WordTiming[]
}> {
  if (!input.apiKey.trim()) throw new Error("Missing ELEVENLABS_API_KEY")
  if (!input.voiceId.trim()) throw new Error("ElevenLabs voiceId is required")
  const endpoint =
    input.endpoint ?? "https://api.elevenlabs.io/v1/text-to-speech"
  const requestBody = {
    text: input.text,
    model_id: input.modelId,
    voice_settings: input.voiceSettings,
  }
  recordProviderRequest({
    provider: "ElevenLabs",
    operation: "text-to-speech with timestamps",
    model: input.modelId,
    request: {
      voiceId: input.voiceId,
      outputFormat: input.outputFormat ?? "mp3_44100_128",
      ...requestBody,
    },
  })
  const response = await (input.fetchImpl ?? fetch)(
    `${endpoint}/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${encodeURIComponent(input.outputFormat ?? "mp3_44100_128")}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": input.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  )
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!response.ok)
    throw new Error(
      [
        `ElevenLabs request failed (${response.status})`,
        payload?.detail ? String(payload.detail) : "",
        // Keep something when the provider sends no `detail`, or sends a body
        // that is not JSON at all -- otherwise only the status survives.
        !payload?.detail && payload
          ? `body=${JSON.stringify(payload).slice(0, 300)}`
          : "",
      ]
        .filter(Boolean)
        .join(" | ")
    )
  const audioBase64 =
    typeof payload?.audio_base64 === "string" ? payload.audio_base64 : ""
  if (!audioBase64) throw new Error("ElevenLabs response did not include audio")
  const alignment = (payload?.normalized_alignment ?? payload?.alignment) as
    Record<string, unknown> | undefined
  const words = alignmentToWords(alignment)
  return {
    audio: Uint8Array.from(Buffer.from(audioBase64, "base64")),
    contentType: "audio/mpeg",
    durationMs: words.at(-1)?.endMs,
    words,
  }
}

export async function synthesizeElevenLabsSpeechToTemp(
  input: Parameters<typeof synthesizeElevenLabsSpeech>[0]
) {
  const result = await synthesizeElevenLabsSpeech(input)
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-elevenlabs-"))
  const audioPath = path.join(tempDir, "voice.mp3")
  const timingsPath = path.join(tempDir, "word-timings.json")
  await Promise.all([
    writeFile(audioPath, result.audio),
    writeFile(timingsPath, JSON.stringify(result.words)),
  ])
  return {
    audioPath,
    timingsPath,
    contentType: result.contentType,
    durationMs: result.durationMs,
    words: result.words,
  }
}

export function alignmentToWords(
  alignment?: Record<string, unknown>
): WordTiming[] {
  const chars = Array.isArray(alignment?.characters)
    ? alignment.characters.map(String)
    : []
  const starts = Array.isArray(alignment?.character_start_times_seconds)
    ? alignment.character_start_times_seconds.map(Number)
    : []
  const ends = Array.isArray(alignment?.character_end_times_seconds)
    ? alignment.character_end_times_seconds.map(Number)
    : []
  const out: WordTiming[] = []
  let text = "",
    start = 0,
    end = 0
  const flush = () => {
    if (text)
      out.push({
        word: text,
        startMs: Math.round(start * 1000),
        endMs: Math.round(end * 1000),
      })
    text = ""
  }
  chars.forEach((char, index) => {
    if (/\s/.test(char)) {
      flush()
      return
    }
    if (!text) start = Number.isFinite(starts[index]) ? starts[index] : 0
    text += char
    end = Number.isFinite(ends[index]) ? ends[index] : start
  })
  flush()
  return out
}
