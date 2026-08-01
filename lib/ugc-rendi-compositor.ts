import type { WordTiming } from "@/lib/elevenlabs-tts"
import {
  downloadRendiOutputBytes,
  pollRendiCommand,
  submitRendiCommand,
  uploadBytesToRendi,
} from "@/lib/rendi-client"

export type UGCCompositeSpec = {
  command: string
  inputFiles: Record<string, string>
  outputFiles: Record<string, string>
  subtitleBytes: Uint8Array
}

export function buildUgcAss(words: WordTiming[], style = "Default"): string {
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: ${escapeAssStyle(style)},Arial,72,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,80,80,220,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`
  const lines = words.map(
    (word) =>
      `Dialogue: 0,${assTime(word.startMs)},${assTime(Math.max(word.endMs, word.startMs + 10))},${escapeAssStyle(style)},,0,0,0,,{\\k${Math.max(1, Math.round((word.endMs - word.startMs) / 10))}}${escapeAssText(word.word)}`
  )
  return `${header}\n${lines.join("\n")}\n`
}

export function buildUgcFfmpegCommand(input: {
  durationSeconds: number
  hook: string
  captions: WordTiming[]
  broll?: Array<{ alias: string; startSeconds: number; endSeconds: number }>
  captionsEnabled?: boolean
  hookDurationMs?: number
}): UGCCompositeSpec {
  const duration = Math.max(
    1,
    Math.min(180, Number(input.durationSeconds) || 30)
  )
  const filters = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[base]`,
  ]
  let current = "base"
  for (const [index, item] of (input.broll ?? []).slice(0, 6).entries()) {
    const start = safeSeconds(item.startSeconds, duration),
      end = Math.max(start, safeSeconds(item.endSeconds, duration))
    filters.push(
      `[${index + 1}:v]scale=1200:2134,zoompan=z='min(zoom+0.0008,1.12)':d=${Math.max(1, Math.round((end - start) * 30))}:s=1080x1920:fps=30[b${index}]`
    )
    filters.push(
      `[${current}][b${index}]overlay=0:0:enable='between(t,${start},${end})'[v${index}]`
    )
    current = `v${index}`
  }
  if (input.captionsEnabled !== false) {
    filters.push(`[${current}]subtitles=captions.ass:fontsdir=.[captioned]`)
    current = "captioned"
  }
  const hook = escapeDrawtext(input.hook).slice(0, 300)
  if (hook) {
    filters.push(
      `[${current}]drawtext=text='${hook}':fontcolor=white:fontsize=72:borderw=5:bordercolor=black:x=(w-text_w)/2:y=180:enable='between(t,0,${Math.min(duration, (input.hookDurationMs ?? 3000) / 1000)})'[finalv]`
    )
    current = "finalv"
  }
  filters.push(`[${current}]split=2[videoout][thumbout]`)
  const broll = (input.broll ?? []).slice(0, 6)
  const command = `ffmpeg -i actor.mp4 ${broll.map((item) => `-i ${safeAlias(item.alias)}`).join(" ")} -filter_complex "${filters.join(";")}" -map "[videoout]" -map 0:a? -t ${duration} -r 30 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart output.mp4 -map "[thumbout]" -frames:v 1 -q:v 2 thumbnail.jpg`
  return {
    command,
    inputFiles: Object.fromEntries(
      [
        "actor.mp4",
        "captions.ass",
        ...broll.map((item) => safeAlias(item.alias)),
      ].map((alias) => [alias, ""])
    ),
    outputFiles: {
      "output.mp4": "output.mp4",
      "thumbnail.jpg": "thumbnail.jpg",
    },
    subtitleBytes: new TextEncoder().encode(buildUgcAss(input.captions)),
  }
}

export async function compositeUgcVideo(input: {
  apiKey: string
  spec: UGCCompositeSpec
  actor: Uint8Array
  broll: Uint8Array[]
  fetchImpl?: typeof fetch
  pollDelayMs?: number
  pollLimit?: number
}) {
  if (!input.apiKey.trim()) throw new Error("Missing RENDI_API_KEY")
  const aliases = Object.keys(input.spec.inputFiles).filter(
    (alias) => alias !== "captions.ass"
  )
  const byteInputs = [input.actor, ...input.broll]
  if (aliases.length !== byteInputs.length)
    throw new Error("Rendi UGC input count mismatch")
  const inputFiles: Record<string, string> = {}
  for (const [index, alias] of aliases.entries()) {
    inputFiles[alias] = (
      await uploadBytesToRendi({
        bytes: byteInputs[index],
        fileName: alias,
        apiKey: input.apiKey,
        fetchImpl: input.fetchImpl,
        pollDelayMs: input.pollDelayMs,
        pollLimit: input.pollLimit,
      })
    ).storage_url!
  }
  inputFiles["captions.ass"] = (
    await uploadBytesToRendi({
      bytes: input.spec.subtitleBytes,
      fileName: "captions.ass",
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      pollDelayMs: input.pollDelayMs,
      pollLimit: input.pollLimit,
    })
  ).storage_url!
  const submitted = await submitRendiCommand({
    apiKey: input.apiKey,
    ffmpegCommand: input.spec.command,
    inputFiles,
    outputFiles: input.spec.outputFiles,
    maxCommandRunSeconds: 600,
    vcpuCount: 4,
    fetchImpl: input.fetchImpl,
  })
  const status = await pollRendiCommand({
    apiKey: input.apiKey,
    commandId: submitted.command_id,
    fetchImpl: input.fetchImpl,
    pollDelayMs: input.pollDelayMs,
    pollLimit: input.pollLimit,
  })
  const videoUrl = status.output_files?.["output.mp4"]?.storage_url,
    thumbnailUrl = status.output_files?.["thumbnail.jpg"]?.storage_url
  if (!videoUrl || !thumbnailUrl)
    throw new Error("Rendi did not return both UGC outputs")
  const [video, thumbnail] = await Promise.all([
    downloadRendiOutputBytes({
      storageUrl: videoUrl,
      fetchImpl: input.fetchImpl,
    }),
    downloadRendiOutputBytes({
      storageUrl: thumbnailUrl,
      fetchImpl: input.fetchImpl,
    }),
  ])
  return {
    video,
    thumbnail,
    requestId: submitted.command_id,
    captionMode: "ass" as const,
  }
}

export function escapeAssText(value: string) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("\n", "\\N")
}
const escapeAssStyle = (value: string) =>
  String(value)
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .slice(0, 64) || "Default"
const escapeDrawtext = (value: string) =>
  String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll(":", "\\:")
    .replaceAll("%", "\\%")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("\n", " ")
const safeAlias = (value: string) =>
  /^[A-Za-z0-9._-]{1,80}$/.test(value)
    ? value
    : (() => {
        throw new Error("Unsafe Rendi input alias")
      })()
const safeSeconds = (value: number, max: number) =>
  Math.max(0, Math.min(max, Number(value) || 0))
const assTime = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10))
  const hours = Math.floor(cs / 360000)
  const minutes = Math.floor(cs / 6000) % 60
  const seconds = Math.floor(cs / 100) % 60
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`
}
