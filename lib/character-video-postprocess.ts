import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"

import { stageAssetToTmp } from "@/lib/asset-storage"
import {
  getRendiApiKey,
  runRendiFfmpegAndDownload,
  uploadLocalFileToRendi,
} from "@/lib/rendi-ffmpeg"

export type MicroCutSegment = {
  start: number
  end: number
}

export function buildMicroCutSegments(input: {
  duration: number
  seed?: number
  count?: number
}): MicroCutSegment[] {
  const duration = Number.isFinite(input.duration) ? input.duration : 0
  if (duration < 1.5) {
    return []
  }
  const count =
    input.count ?? Math.max(1, Math.min(4, Math.floor(duration / 2)))
  const random = seededRandom(input.seed ?? Date.now())
  const minStart = 0.5
  const maxEnd = Math.max(minStart, duration - 0.5)
  const slots = Array.from({ length: count }, (_, index) => {
    const slotStart = minStart + ((maxEnd - minStart) * index) / count
    const slotEnd = minStart + ((maxEnd - minStart) * (index + 1)) / count
    const cutLength = 0.2 + random() * 0.1
    const start = Math.min(
      slotEnd - cutLength,
      slotStart + random() * Math.max(0.01, slotEnd - slotStart - cutLength)
    )
    return {
      start: roundTime(Math.max(minStart, start)),
      end: roundTime(Math.min(maxEnd, start + cutLength)),
    }
  })
  return slots.filter((slot) => slot.end > slot.start)
}

export function buildMicroCutFilter(segments: MicroCutSegment[]) {
  const cuts = segments
    .map(
      (segment) =>
        `between(t,${segment.start.toFixed(3)},${segment.end.toFixed(3)})`
    )
    .join("+")
  return `select='not(${cuts})',setpts=N/FRAME_RATE/TB`
}

export function isAudioFilePath(filePath: string) {
  return /\.(?:mp3|m4a|wav|ogg)$/i.test(filePath)
}

export async function findRandomMusicFile(
  input: {
    rootDir?: string
    seed?: number
  } = {}
) {
  const rootDir = input.rootDir ?? path.join(process.cwd(), "data", "music")
  const files = await walkFiles(rootDir)
  const audioFiles = files.filter(isAudioFilePath)
  if (audioFiles.length === 0) {
    return ""
  }
  const random = seededRandom(input.seed ?? Date.now())
  return audioFiles[Math.floor(random() * audioFiles.length)] ?? audioFiles[0]
}

export async function getVideoDuration(filePath: string) {
  const apiKey = getRendiApiKey()
  const staged = await stageAssetToTmp(filePath)
  const storedFile = await uploadLocalFileToRendi({ filePath: staged, apiKey })
  const duration = Number(storedFile.duration)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read generated video duration")
  }
  return duration
}

export async function postProcessCharacterVideo(input: {
  inputVideoPath: string
  outputVideoPath: string
  musicPath?: string
  seed?: number
}) {
  const apiKey = getRendiApiKey()
  if (!apiKey) {
    throw new Error("Missing RENDI_API_KEY")
  }

  const stagedInputVideo = await stageAssetToTmp(input.inputVideoPath)
  const inputVideo = await uploadLocalFileToRendi({
    filePath: stagedInputVideo,
    apiKey,
  })
  const duration = Number(inputVideo.duration)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read generated video duration")
  }

  const musicFile = input.musicPath
    ? await uploadLocalFileToRendi({
        filePath: await stageAssetToTmp(input.musicPath),
        apiKey,
      })
    : null
  const segments = buildMicroCutSegments({
    duration,
    seed: input.seed,
  })
  await mkdir(path.dirname(input.outputVideoPath), { recursive: true })
  const videoFilter =
    segments.length > 0
      ? buildMicroCutFilter(segments)
      : "setpts=N/FRAME_RATE/TB"
  const status = await runRendiFfmpegAndDownload({
    apiKey,
    ffmpegCommand: buildCharacterPostprocessFfmpegCommand({
      videoFilter,
      hasMusic: Boolean(musicFile?.storage_url),
    }),
    inputFiles: {
      in_video: requiredStorageUrl(inputVideo),
      ...(musicFile ? { in_music: requiredStorageUrl(musicFile) } : {}),
    },
    outputFiles: {
      out_video: path.basename(input.outputVideoPath),
    },
    outputAlias: "out_video",
    outputPath: input.outputVideoPath,
    maxCommandRunSeconds: 300,
    vcpuCount: 8,
    metadata: {
      workflow: "character_video_postprocess",
    },
  })
  return {
    duration,
    segments,
    musicPath: input.musicPath || "",
    rendiCommandId: status.command_id,
  }
}

export function buildCharacterPostprocessFfmpegCommand(input: {
  videoFilter: string
  hasMusic: boolean
}) {
  return [
    "-i",
    "{{in_video}}",
    ...(input.hasMusic ? ["-stream_loop", "-1", "-i", "{{in_music}}"] : []),
    "-vf",
    quoteFfmpegArg(input.videoFilter),
    ...(input.hasMusic
      ? ["-map", "0:v:0", "-map", "1:a:0", "-shortest", "-af", "volume=0.45"]
      : ["-an"]),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "{{out_video}}",
  ].join(" ")
}

async function walkFiles(rootDir: string): Promise<string[]> {
  let entries: {
    name: string
    isDirectory: () => boolean
    isFile: () => boolean
  }[]
  try {
    entries = (await readdir(rootDir, {
      withFileTypes: true,
    })) as unknown as typeof entries
  } catch {
    return []
  }
  const children = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(rootDir, entry.name)
      if (entry.isDirectory()) {
        return walkFiles(filePath)
      }
      return entry.isFile() ? [filePath] : []
    })
  )
  return children.flat()
}

function seededRandom(seed: number) {
  let state = Math.trunc(seed) || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000
}

function quoteFfmpegArg(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function requiredStorageUrl(file: { storage_url?: string | null }) {
  if (!file.storage_url) {
    throw new Error("Rendi file is missing storage_url")
  }
  return file.storage_url
}
