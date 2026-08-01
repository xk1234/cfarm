import path from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises"

import { createAssetOnce, persistAsset } from "@/lib/asset-storage"
import { fetchWithTimeout } from "@/lib/http"

type FetchLike = typeof fetch

export async function downloadRemoteFileToLocalAsset(input: {
  url: string
  taskId: string
  folder: string
  publicPrefix: string
  fallbackName: string
  failureMessage: string
  extensionForContentType: (contentType: string) => string
  fetchImpl?: FetchLike
}) {
  const downloaded = await downloadRemoteFileToTemp(input)
  try {
    return await persistDownloadedFileToLocalAsset({
      tempPath: downloaded.tempPath,
      fileName: downloaded.fileName,
      folder: input.folder,
      publicPrefix: input.publicPrefix,
    })
  } finally {
    await discardDownloadedTempFile(downloaded.tempPath)
  }
}

export async function downloadRemoteFileToTemp(input: {
  url: string
  taskId: string
  fallbackName: string
  failureMessage: string
  extensionForContentType: (contentType: string) => string
  fetchImpl?: FetchLike
}) {
  const response = await fetchWithTimeout(input.url, undefined, {
    fetchImpl: input.fetchImpl,
    timeoutMs: 120_000,
  })
  if (!response.ok) {
    throw new Error(input.failureMessage)
  }

  const extension = input.extensionForContentType(
    response.headers.get("content-type") ?? ""
  )
  const safeTaskId = input.taskId.replace(/[^a-zA-Z0-9_-]/g, "")
  const fileName = `${Date.now()}-${safeTaskId || input.fallbackName}${extension}`
  const tempDir = path.join(os.tmpdir(), `cfarm-provider-${randomUUID()}`)
  await mkdir(tempDir, { recursive: true })
  const tempPath = path.join(tempDir, fileName)
  await writeFile(tempPath, Buffer.from(await response.arrayBuffer()))

  return { tempPath, fileName }
}

export async function persistDownloadedFileToLocalAsset(input: {
  tempPath: string
  fileName: string
  folder: string
  publicPrefix: string
}) {
  assertProviderTempPath(input.tempPath)
  const filePath = path.join(input.folder, path.basename(input.fileName))
  await persistAsset(filePath, await readFile(input.tempPath))

  return `${input.publicPrefix}/${encodeURIComponent(path.basename(input.fileName))}`
}

export async function pipelineTempFileInfo(tempPath: string) {
  assertProviderTempPath(tempPath)
  const info = await stat(tempPath)
  if (!info.isFile() || info.size <= 0) {
    throw new Error("Pipeline temp file is empty or missing")
  }
  return { size: info.size, fileName: path.basename(tempPath) }
}

export async function readPipelineTempFilePart(input: {
  tempPath: string
  offset: number
  size: number
}) {
  assertProviderTempPath(input.tempPath)
  const handle = await open(input.tempPath, "r")
  try {
    const bytes = Buffer.alloc(input.size)
    const result = await handle.read(bytes, 0, input.size, input.offset)
    return bytes.subarray(0, result.bytesRead)
  } finally {
    await handle.close()
  }
}

export async function persistPipelineTempFile(input: {
  tempPath: string
  outputPath: string
}) {
  assertProviderTempPath(input.tempPath)
  await createAssetOnce(input.outputPath, await readFile(input.tempPath))
}

export async function discardDownloadedTempFile(tempPath: string) {
  const tempDir = assertProviderTempPath(tempPath)
  await rm(tempDir, { recursive: true, force: true })
}

function assertProviderTempPath(tempPath: string) {
  const tempRoot = path.resolve(os.tmpdir())
  const tempDir = path.dirname(path.resolve(tempPath))
  const allowedPrefixes = [
    "cfarm-provider-",
    "cfarm-slideshow-video-",
    "cfarm-ugc-rendi-",
    "cfarm-elevenlabs-",
    "cfarm-rendi-upload-",
  ]
  if (
    !tempDir.startsWith(`${tempRoot}${path.sep}`) ||
    !allowedPrefixes.some((prefix) => path.basename(tempDir).startsWith(prefix))
  ) {
    throw new Error("Unrecognized provider temp path")
  }
  return tempDir
}
