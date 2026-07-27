import { open, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import { persistAsset } from "@/lib/asset-storage"
import {
  completeRendiUpload,
  initializeRendiUpload,
  rendiSafeFileName,
  runRendiFfmpegAndDownloadBytes,
  uploadRendiPart,
} from "@/lib/rendi-client"

type FetchLike = typeof fetch

export {
  getRendiApiKey,
  uploadBytesToRendi,
  type RendiStoredFile,
} from "@/lib/rendi-client"

export async function uploadLocalFileToRendi(input: {
  filePath: string
  apiKey: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new Error("Missing RENDI_API_KEY")
  }

  const fileStats = await stat(input.filePath)
  if (!fileStats.isFile() || fileStats.size <= 0) {
    throw new Error("Rendi upload requires a non-empty local file")
  }

  const initUpload = await initializeRendiUpload({
    apiKey,
    fileName: rendiSafeFileName(path.basename(input.filePath)),
    sizeBytes: fileStats.size,
    fetchImpl: input.fetchImpl,
  })

  const file = await open(input.filePath, "r")
  const parts: Array<{ part_number: number; etag: string }> = []
  try {
    for (const [index, uploadUrl] of initUpload.upload_urls.entries()) {
      const offset = index * initUpload.part_size
      const size = Math.min(initUpload.part_size, fileStats.size - offset)
      const buffer = Buffer.alloc(size)
      await file.read(buffer, 0, size, offset)
      parts.push(
        await uploadRendiPart({
          uploadUrl,
          bytes: buffer,
          partNumber: index + 1,
          fetchImpl: input.fetchImpl,
        })
      )
    }
  } finally {
    await file.close()
  }

  return completeRendiUpload({
    apiKey,
    fileId: initUpload.file_id,
    parts,
    fetchImpl: input.fetchImpl,
    pollDelayMs: input.pollDelayMs,
    pollLimit: input.pollLimit,
  })
}

export async function runRendiFfmpegAndDownload(input: {
  apiKey: string
  ffmpegCommand: string
  inputFiles: Record<string, string>
  outputFiles: Record<string, string>
  outputAlias: string
  outputPath: string
  localOutputPath?: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
  maxCommandRunSeconds?: number
  vcpuCount?: number
  metadata?: Record<string, string | number | boolean>
}) {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new Error("Missing RENDI_API_KEY")
  }

  const result = await runRendiFfmpegAndDownloadBytes({
    apiKey,
    ffmpegCommand: input.ffmpegCommand,
    inputFiles: input.inputFiles,
    outputFiles: input.outputFiles,
    outputAlias: input.outputAlias,
    fetchImpl: input.fetchImpl,
    pollDelayMs: input.pollDelayMs,
    pollLimit: input.pollLimit,
    maxCommandRunSeconds: input.maxCommandRunSeconds,
    vcpuCount: input.vcpuCount,
    metadata: input.metadata,
  })
  await persistAsset(input.outputPath, result.bytes)
  if (input.localOutputPath) {
    await writeFile(input.localOutputPath, result.bytes)
  }
  return result.status
}
