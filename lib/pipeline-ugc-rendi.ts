import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { clean, isRecord } from "@/lib/guards"
import {
  buildUgcFfmpegCommand,
  type UGCCompositeSpec,
} from "@/lib/ugc-rendi-compositor"

export async function prepareUgcRendiComposite(input: Record<string, unknown>) {
  const actorLocalFilePath = requiredString(
    input.actorLocalFilePath,
    "actorLocalFilePath"
  )
  const broll = arrayOfRecords(input.brollLocalInputs).map((item, index) => ({
    alias: requiredString(item.alias, `brollLocalInputs.${index}.alias`),
    localFilePath: requiredString(
      item.localFilePath,
      `brollLocalInputs.${index}.localFilePath`
    ),
    startSeconds: numberValue(item.startSeconds),
    endSeconds: numberValue(item.endSeconds),
  }))
  const captions = arrayOfRecords(input.voiceWords).map((item, index) => ({
    word: requiredString(item.word, `voiceWords.${index}.word`),
    startMs: numberValue(item.startMs),
    endMs: numberValue(item.endMs),
  }))
  const spec = buildUgcFfmpegCommand({
    durationSeconds: numberValue(input.durationSeconds) || 30,
    hook: clean(input.hook),
    captions,
    broll,
    captionsEnabled: input.captionsEnabled !== false,
    hookDurationMs: numberValue(input.hookDurationMs) || undefined,
  })
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-ugc-rendi-"))
  const captionsPath = path.join(tempDir, "captions.ass")
  await writeFile(captionsPath, spec.subtitleBytes)
  return {
    rendiLocalInputs: [
      {
        alias: "actor.mp4",
        fileName: "actor.mp4",
        localFilePath: actorLocalFilePath,
      },
      ...broll.map((item) => ({
        alias: item.alias,
        fileName: item.alias,
        localFilePath: item.localFilePath,
      })),
      {
        alias: "captions.ass",
        fileName: "captions.ass",
        localFilePath: captionsPath,
      },
    ],
    rendiCommandRequest: commandRequest(spec),
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

function commandRequest(spec: UGCCompositeSpec) {
  return {
    ffmpegCommand: spec.command,
    inputFiles: spec.inputFiles,
    outputFiles: spec.outputFiles,
    maxCommandRunSeconds: 600,
    vcpuCount: 4,
    metadata: { workflow: "ugc_composite" },
  }
}

function arrayOfRecords(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error("Expected a JSON object array")
  }
  return value as Record<string, unknown>[]
}

function requiredString(value: unknown, name: string) {
  const result = clean(value)
  if (!result) throw new Error(`${name} is required`)
  return result
}

function numberValue(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}
