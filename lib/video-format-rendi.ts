import { clean, isRecord } from "@/lib/guards"

export type FixedVideoFormat = "react_reveal" | "greenscreen_meme"

export type FixedVideoRenderPlan = {
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
    metadata: { workflow: string }
  }
  rendiOutputSpecs: Array<{
    alias: string
    fileName: string
    outputKind: "video" | "thumbnail"
  }>
}

export function buildFixedVideoRenderPlan(
  format: FixedVideoFormat,
  input: Record<string, unknown>
): FixedVideoRenderPlan {
  return format === "react_reveal"
    ? buildReactRevealPlan(input)
    : buildGreenscreenMemePlan(input)
}

function buildReactRevealPlan(input: Record<string, unknown>) {
  const anticipation = staged(input, "anticipation")
  const reveal = staged(input, "reveal")
  const audio = optionalStaged(input, "audio")
  const anticipationFilter = drawTextFilter(
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30",
    clean(asRecord(input.components).hookCaption)
  )
  const revealFilter = drawTextFilter(
    "[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30",
    clean(asRecord(input.components).payoffCaption),
    "h-text_h-220"
  )
  const soundIndex = audio ? 2 : -1
  const command = [
    "ffmpeg",
    "-i anticipation.mp4",
    "-i reveal.mp4",
    ...(audio ? ["-stream_loop -1 -i soundtrack"] : []),
    `-filter_complex "${anticipationFilter}[anticipation];${revealFilter}[reveal];[anticipation][reveal]concat=n=2:v=1:a=0,split=2[videoout][thumbout]"`,
    '-map "[videoout]"',
    ...(audio ? [`-map ${soundIndex}:a -shortest -c:a aac`] : ["-an"]),
    "-r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4",
    '-map "[thumbout]" -frames:v 1 -q:v 2 thumbnail.jpg',
  ].join(" ")
  return plan(
    "react_reveal",
    [anticipation, reveal, ...(audio ? [audio] : [])],
    command
  )
}

function buildGreenscreenMemePlan(input: Record<string, unknown>) {
  const meme = staged(input, "meme")
  const background = staged(input, "background")
  const audio = optionalStaged(input, "audio")
  const caption = escapeDrawtext(clean(asRecord(input.components).caption))
  const textPlacement = clean(asRecord(input.components).textPlacement)
  const y =
    textPlacement === "bottom"
      ? "h-text_h-170"
      : textPlacement === "middle"
        ? "(h-text_h)/2"
        : "150"
  const captionFilter = caption
    ? `,drawtext=text='${caption}':fontcolor=white:fontsize=64:borderw=6:bordercolor=black:x=(w-text_w)/2:y=${y}`
    : ""
  const soundIndex = audio ? 2 : -1
  const command = [
    "ffmpeg",
    "-i meme.mp4",
    "-loop 1 -i background",
    ...(audio ? ["-stream_loop -1 -i soundtrack"] : []),
    `-filter_complex "[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];[0:v]chromakey=0x00FF00:0.24:0.10,scale=1080:1920:force_original_aspect_ratio=decrease[subject];[bg][subject]overlay=(W-w)/2:H-h:shortest=1${captionFilter},fps=30,split=2[videoout][thumbout]"`,
    '-map "[videoout]"',
    ...(audio ? [`-map ${soundIndex}:a -shortest -c:a aac`] : ["-an"]),
    "-r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4",
    '-map "[thumbout]" -frames:v 1 -q:v 2 thumbnail.jpg',
  ].join(" ")
  return plan(
    "greenscreen_meme",
    [meme, background, ...(audio ? [audio] : [])],
    command
  )
}

function plan(
  format: FixedVideoFormat,
  inputs: FixedVideoRenderPlan["rendiLocalInputs"],
  ffmpegCommand: string
): FixedVideoRenderPlan {
  return {
    rendiLocalInputs: inputs,
    rendiCommandRequest: {
      ffmpegCommand,
      inputFiles: Object.fromEntries(inputs.map((item) => [item.alias, ""])),
      outputFiles: {
        "output.mp4": "output.mp4",
        "thumbnail.jpg": "thumbnail.jpg",
      },
      maxCommandRunSeconds: 600,
      vcpuCount: 4,
      metadata: { workflow: format },
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

function staged(input: Record<string, unknown>, role: string) {
  const source = asRecord(asRecord(input.stagedMedia)[role])
  const localFilePath = clean(source.localFilePath)
  if (!localFilePath) throw new Error(`${role} media has not been staged`)
  return {
    alias:
      role === "anticipation"
        ? "anticipation.mp4"
        : role === "reveal"
          ? "reveal.mp4"
          : role === "meme"
            ? "meme.mp4"
            : "background",
    fileName: clean(source.fileName) || `${role}.bin`,
    localFilePath,
  }
}

function optionalStaged(input: Record<string, unknown>, role: string) {
  const source = asRecord(asRecord(input.stagedMedia)[role])
  const localFilePath = clean(source.localFilePath)
  return localFilePath
    ? {
        alias: "soundtrack",
        fileName: clean(source.fileName) || "soundtrack.bin",
        localFilePath,
      }
    : null
}

function drawTextFilter(base: string, text: string, y = "170") {
  const escaped = escapeDrawtext(text)
  return escaped
    ? `${base},drawtext=text='${escaped}':fontcolor=white:fontsize=64:borderw=6:bordercolor=black:x=(w-text_w)/2:y=${y}`
    : base
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
    .slice(0, 300)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
