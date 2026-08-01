import path from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"

import { persistAsset } from "@/lib/asset-storage"
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

export async function discardDownloadedTempFile(tempPath: string) {
  const tempDir = assertProviderTempPath(tempPath)
  await rm(tempDir, { recursive: true, force: true })
}

function assertProviderTempPath(tempPath: string) {
  const tempRoot = path.resolve(os.tmpdir())
  const tempDir = path.dirname(path.resolve(tempPath))
  if (
    !tempDir.startsWith(`${tempRoot}${path.sep}`) ||
    !path.basename(tempDir).startsWith("cfarm-provider-")
  ) {
    throw new Error("Unrecognized provider temp path")
  }
  return tempDir
}
