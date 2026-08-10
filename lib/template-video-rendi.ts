import { clean, isRecord } from "@/lib/guards"

type ResolvedClip = {
  key: string
  kind: "video" | "image"
  durationMs: number
  playFullVideo: boolean
  transition: "cut" | "fade"
  texts: Array<Record<string, unknown>>
}

export type TemplateVideoRenderPlan = {
  rendiLocalInputs: Array<{
    alias: string
    fileName: string
    localFilePath: string
  }>
  rendiCommandRequest: {
    ffmpegCommand: string
    inputFiles: Record<string, string>
    outputFiles: Record<string, string>
    maxCommandRunSeconds: number
    vcpuCount: number
    metadata: { workflow: string; template: string }
  }
  rendiOutputSpecs: Array<{
    alias: string
    fileName: string
    outputKind: "video" | "thumbnail"
  }>
}

export function buildTemplateVideoRenderPlan(
  input: Record<string, unknown>
): TemplateVideoRenderPlan {
  const components = asRecord(input.components)
  const clips = array(components.clips).map(normalizeClip)
  if (clips.length === 0) throw new Error("Video template has no media clips")
  const staged = asRecord(input.stagedMedia)
  const localInputs = clips.map((clip, index) => {
    const source = asRecord(staged[clip.key])
    return {
      alias: clipAlias(index, clip.kind),
      fileName: clean(source.fileName) || clipAlias(index, clip.kind),
      localFilePath: required(
        clean(source.localFilePath),
        `${clip.key} staged media`
      ),
    }
  })
  const audioSource = asRecord(staged.audio)
  const audioPath = clean(audioSource.localFilePath)
  if (audioPath) {
    localInputs.push({
      alias: "soundtrack",
      fileName: clean(audioSource.fileName) || "soundtrack.mp3",
      localFilePath: audioPath,
    })
  }
  const template = clean(components.template) || "template_video"
  const command =
    template === "split_screen"
      ? splitScreenCommand(clips, Boolean(audioPath), components)
      : timelineCommand(clips, Boolean(audioPath), components, template)
  return {
    rendiLocalInputs: localInputs,
    rendiCommandRequest: {
      ffmpegCommand: command,
      inputFiles: Object.fromEntries(
        localInputs.map((item) => [item.alias, ""])
      ),
      outputFiles: {
        "output.mp4": "output.mp4",
        "thumbnail.jpg": "thumbnail.jpg",
      },
      maxCommandRunSeconds: 900,
      vcpuCount: 4,
      metadata: { workflow: "template_video", template },
    },
    rendiOutputSpecs: [
      { alias: "output.mp4", fileName: "output.mp4", outputKind: "video" },
      {
        alias: "thumbnail.jpg",
        fileName: "thumbnail.jpg",
        outputKind: "thumbnail",
      },
    ],
  }
}

function timelineCommand(
  clips: ResolvedClip[],
  hasAudio: boolean,
  components: Record<string, unknown>,
  template: string
) {
  const inputs = clips.flatMap((clip, index) =>
    clip.kind === "image"
      ? [
          `-loop 1 -t ${seconds(clip.durationMs)} -i ${clipAlias(index, clip.kind)}`,
        ]
      : [`-i ${clipAlias(index, clip.kind)}`]
  )
  if (hasAudio) inputs.push("-stream_loop -1 -i soundtrack")
  const filters = clips.map((clip, index) => {
    const duration = seconds(clip.durationMs)
    const trim =
      clip.kind === "image" || !clip.playFullVideo
        ? `,trim=duration=${duration}`
        : ""
    const textFilters = clip.texts.map(drawText).filter(Boolean).join("")
    return `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30${trim},setpts=PTS-STARTPTS${textFilters}[v${index}]`
  })
  const concat =
    clips.length === 1
      ? "[v0]null[sequence]"
      : `${clips.map((_, index) => `[v${index}]`).join("")}concat=n=${clips.length}:v=1:a=0[sequence]`
  const globalTexts = array(components.globalTexts)
  const globalFilters = globalTexts.map(drawText).filter(Boolean).join("")
  const fakeTextFilters =
    template === "fake_text"
      ? globalTexts
          .map((text, index) =>
            drawText({
              ...asRecord(text),
              textPosition: index % 2 === 0 ? "top" : "bottom",
              enable: `gte(t,${(index * 1.25).toFixed(2)})`,
            })
          )
          .filter(Boolean)
          .join("")
      : globalFilters
  filters.push(
    `${concat};[sequence]${fakeTextFilters || "null"},split=2[videoout][thumbout]`
  )
  const audioIndex = clips.length
  return [
    "ffmpeg",
    ...inputs,
    `-filter_complex "${filters.join(";")}"`,
    '-map "[videoout]"',
    ...(hasAudio ? [`-map ${audioIndex}:a -shortest -c:a aac`] : ["-an"]),
    "-r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4",
    '-map "[thumbout]" -frames:v 1 -q:v 2 thumbnail.jpg',
  ].join(" ")
}

function splitScreenCommand(
  clips: ResolvedClip[],
  hasAudio: boolean,
  components: Record<string, unknown>
) {
  if (clips.length < 2) throw new Error("Split Screen requires two clips")
  const inputs = clips
    .slice(0, 2)
    .map((clip, index) =>
      clip.kind === "image"
        ? `-loop 1 -t ${seconds(clip.durationMs)} -i ${clipAlias(index, clip.kind)}`
        : `-stream_loop -1 -i ${clipAlias(index, clip.kind)}`
    )
  if (hasAudio) inputs.push("-stream_loop -1 -i soundtrack")
  const texts = array(components.globalTexts)
    .map(drawText)
    .filter(Boolean)
    .join("")
  const filter = [
    "[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1,fps=30[top]",
    "[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1,fps=30[bottom]",
    `[top][bottom]vstack=inputs=2${texts},split=2[videoout][thumbout]`,
  ].join(";")
  return [
    "ffmpeg",
    ...inputs,
    `-filter_complex "${filter}"`,
    '-map "[videoout]"',
    ...(hasAudio ? ["-map 2:a -shortest -c:a aac"] : ["-an -t 60"]),
    "-r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4",
    '-map "[thumbout]" -frames:v 1 -q:v 2 thumbnail.jpg',
  ].join(" ")
}

function normalizeClip(value: unknown, index: number): ResolvedClip {
  const clip = asRecord(value)
  const kind = clean(clip.kind) === "image" ? "image" : "video"
  return {
    key: clean(clip.key) || `clip-${index}`,
    kind,
    durationMs: Math.max(500, Number(clip.durationMs) || 2500),
    playFullVideo: clip.playFullVideo === true,
    transition: clean(clip.transition) === "fade" ? "fade" : "cut",
    texts: array(clip.texts).map(asRecord),
  }
}

function drawText(value: unknown) {
  const item = asRecord(value)
  const text = escapeDrawtext(clean(item.text))
  if (!text) return ""
  const position = clean(item.textPosition)
  const y =
    position === "bottom"
      ? "h-text_h-150"
      : position === "top"
        ? "120"
        : "(h-text_h)/2"
  const fontSize = Math.max(
    28,
    Math.min(100, parseInt(clean(item.fontSize), 10) * 7 || 58)
  )
  const style = clean(item.textStyle)
  const background = style.toLowerCase().includes("background")
    ? ":box=1:boxcolor=black@0.55:boxborderw=24"
    : ":borderw=6:bordercolor=black"
  const enable = clean(item.enable)
    ? `:enable='${escapeExpression(clean(item.enable))}'`
    : ""
  return `,drawtext=text='${text}':fontcolor=white:fontsize=${fontSize}${background}:x=(w-text_w)/2:y=${y}${enable}`
}

function clipAlias(index: number, kind: "video" | "image") {
  return `clip-${index}.${kind === "image" ? "jpg" : "mp4"}`
}

function seconds(milliseconds: number) {
  return (Math.max(500, milliseconds) / 1000).toFixed(3)
}

function escapeDrawtext(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll(":", "\\:")
    .replaceAll("%", "\\%")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("\n", " ")
    .slice(0, 600)
}

function escapeExpression(value: string) {
  return value.replaceAll("'", "\\'")
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function required(value: string, label: string) {
  if (!value) throw new Error(`${label} is required`)
  return value
}
