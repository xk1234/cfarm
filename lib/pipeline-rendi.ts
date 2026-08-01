import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  completeRendiUploadRequest,
  getRendiCommand,
  getRendiFile,
  initializeRendiUpload,
  rendiSafeFileName,
  submitRendiCommand,
  uploadRendiPart,
} from "@/lib/rendi-client"
import {
  downloadRemoteFileToTemp,
  pipelineTempFileInfo,
  readPipelineTempFilePart,
} from "@/lib/local-asset-download"

type UploadSession = {
  fileId: string
  partSize: number
  uploadUrls: string[]
}

export async function initializeRendiUploadSession(input: {
  apiKey: string
  localFilePath: string
  fileName?: string
  fetchImpl?: typeof fetch
}) {
  const file = await pipelineTempFileInfo(input.localFilePath)
  const initialized = await initializeRendiUpload({
    apiKey: input.apiKey,
    fileName: rendiSafeFileName(input.fileName || file.fileName),
    sizeBytes: file.size,
    fetchImpl: input.fetchImpl,
  })
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-rendi-upload-"))
  const uploadSessionPath = path.join(tempDir, "session.json")
  await writeFile(
    uploadSessionPath,
    JSON.stringify({
      fileId: initialized.file_id,
      partSize: initialized.part_size,
      uploadUrls: initialized.upload_urls,
    } satisfies UploadSession)
  )
  return {
    fileId: initialized.file_id,
    partSize: initialized.part_size,
    partCount: initialized.upload_urls.length,
    uploadSessionPath,
    fileSize: file.size,
  }
}

export async function uploadRendiSessionPart(input: {
  uploadSessionPath: string
  localFilePath: string
  partNumber: number
  fileSize: number
  fetchImpl?: typeof fetch
}) {
  const session = await readUploadSession(input.uploadSessionPath)
  const uploadUrl = session.uploadUrls[input.partNumber - 1]
  if (!uploadUrl) throw new Error("Rendi upload part is out of range")
  const offset = (input.partNumber - 1) * session.partSize
  const bytes = await readPipelineTempFilePart({
    tempPath: input.localFilePath,
    offset,
    size: Math.min(session.partSize, input.fileSize - offset),
  })
  return uploadRendiPart({
    uploadUrl,
    bytes,
    partNumber: input.partNumber,
    fetchImpl: input.fetchImpl,
  })
}

export async function completeRendiSessionUpload(input: {
  apiKey: string
  fileId: string
  parts: Array<{ part_number: number; etag: string }>
  fetchImpl?: typeof fetch
}) {
  return completeRendiUploadRequest(input)
}

export async function getRendiUploadStatus(input: {
  apiKey: string
  fileId: string
  fetchImpl?: typeof fetch
}) {
  return getRendiFile(input)
}

export async function submitRendiFfmpeg(
  input: Parameters<typeof submitRendiCommand>[0]
) {
  return submitRendiCommand(input)
}

export async function getRendiFfmpegStatus(
  input: Parameters<typeof getRendiCommand>[0]
) {
  return getRendiCommand(input)
}

export async function downloadRendiOutputToTemp(input: {
  remoteUrl: string
  commandId: string
  fileName: string
  fetchImpl?: typeof fetch
}) {
  return downloadRemoteFileToTemp({
    url: input.remoteUrl,
    taskId: input.commandId,
    fallbackName: path.parse(input.fileName).name || "rendi-output",
    failureMessage: "Failed to download Rendi output",
    fetchImpl: input.fetchImpl,
    extensionForContentType: () => path.extname(input.fileName) || ".bin",
  })
}

export async function discardRendiUploadSession(uploadSessionPath: string) {
  const sessionPath = validatedSessionPath(uploadSessionPath)
  await rm(path.dirname(sessionPath), { recursive: true, force: true })
}

async function readUploadSession(uploadSessionPath: string) {
  const value = JSON.parse(
    await readFile(validatedSessionPath(uploadSessionPath), "utf8")
  ) as UploadSession
  if (
    !value.fileId ||
    !Number.isFinite(value.partSize) ||
    !Array.isArray(value.uploadUrls)
  ) {
    throw new Error("Invalid Rendi upload session")
  }
  return value
}

function validatedSessionPath(value: string) {
  const tempRoot = path.resolve(os.tmpdir())
  const resolved = path.resolve(value)
  const parent = path.dirname(resolved)
  if (
    !parent.startsWith(`${tempRoot}${path.sep}`) ||
    !path.basename(parent).startsWith("cfarm-rendi-upload-") ||
    path.basename(resolved) !== "session.json"
  ) {
    throw new Error("Unrecognized Rendi upload session")
  }
  return resolved
}
