import { randomUUID } from "node:crypto"

import { cleanString, readLooseRecord, readTrimmedString } from "@/lib/guards"
import { fetchWithTimeout } from "@/lib/http"
import { readResponseBytes } from "@/lib/bounded-fetch"
import { pollUntil } from "@/lib/poll"

const RENDI_API_BASE_URL = "https://api.rendi.dev"
const DEFAULT_POLL_DELAY_MS = 5000
const DEFAULT_FILE_POLL_LIMIT = 120
const DEFAULT_COMMAND_POLL_LIMIT = 240

type FetchLike = typeof fetch

export type RendiStoredFile = {
  file_id: string
  status?: string | null
  storage_url?: string | null
  duration?: number | null
  error_status?: string | null
  external_error_message?: string | null
}

export type RendiCommandStatus = {
  command_id: string
  status: string
  error_status?: string | null
  error_message?: string | null
  output_files?: Record<string, RendiStoredFile> | null
}

export class RendiApiError extends Error {
  status: number
  details: unknown

  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.name = "RendiApiError"
    this.status = status
    this.details = details
  }
}

export function getRendiApiKey() {
  return process.env.RENDI_API_KEY?.trim() ?? ""
}

export async function initializeRendiUpload(input: {
  apiKey: string
  fileName: string
  sizeBytes: number
  fetchImpl?: FetchLike
}) {
  const apiKey = requiredApiKey(input.apiKey)
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("Rendi upload requires non-empty bytes")
  }
  const initialized = await rendiJson<{
    file_id: string
    part_size: number
    upload_urls: string[]
  }>({
    apiKey,
    path: "/v1/files/init-upload",
    method: "POST",
    body: {
      filename: rendiSafeFileName(input.fileName),
      size_bytes: input.sizeBytes,
    },
    fetchImpl: input.fetchImpl,
  })
  if (
    !initialized.file_id ||
    !Number.isFinite(initialized.part_size) ||
    !Array.isArray(initialized.upload_urls) ||
    initialized.upload_urls.length === 0
  ) {
    throw new Error("Rendi did not return valid upload URLs")
  }
  return initialized
}

export async function uploadRendiPart(input: {
  uploadUrl: string
  bytes: Uint8Array
  partNumber: number
  fetchImpl?: FetchLike
}) {
  const response = await fetchWithTimeout(
    input.uploadUrl,
    { method: "PUT", body: Buffer.from(input.bytes) },
    { fetchImpl: input.fetchImpl, timeoutMs: 120_000 }
  )
  if (!response.ok) {
    throw new Error(`Rendi file part upload failed with ${response.status}`)
  }
  const etag = response.headers.get("etag") ?? response.headers.get("ETag")
  if (!etag) {
    throw new Error("Rendi file part upload did not return an ETag")
  }
  return { part_number: input.partNumber, etag }
}

export async function completeRendiUpload(input: {
  apiKey: string
  fileId: string
  parts: Array<{ part_number: number; etag: string }>
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  const completed = await completeRendiUploadRequest(input)
  if (completed.status === "STORED" && completed.storage_url) {
    return completed
  }
  return pollRendiFile(input)
}

export async function completeRendiUploadRequest(input: {
  apiKey: string
  fileId: string
  parts: Array<{ part_number: number; etag: string }>
  fetchImpl?: FetchLike
}) {
  return rendiJson<RendiStoredFile>({
    apiKey: requiredApiKey(input.apiKey),
    path: `/v1/files/${encodeURIComponent(input.fileId)}/complete-upload`,
    method: "POST",
    body: { parts: input.parts },
    fetchImpl: input.fetchImpl,
  })
}

export async function uploadBytesToRendi(input: {
  bytes: Uint8Array
  fileName: string
  apiKey: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  const initialized = await initializeRendiUpload({
    apiKey: input.apiKey,
    fileName: input.fileName,
    sizeBytes: input.bytes.byteLength,
    fetchImpl: input.fetchImpl,
  })
  const parts = []
  for (const [index, uploadUrl] of initialized.upload_urls.entries()) {
    const offset = index * initialized.part_size
    parts.push(
      await uploadRendiPart({
        uploadUrl,
        bytes: input.bytes.slice(
          offset,
          Math.min(input.bytes.byteLength, offset + initialized.part_size)
        ),
        partNumber: index + 1,
        fetchImpl: input.fetchImpl,
      })
    )
  }
  return completeRendiUpload({
    apiKey: input.apiKey,
    fileId: initialized.file_id,
    parts,
    fetchImpl: input.fetchImpl,
    pollDelayMs: input.pollDelayMs,
    pollLimit: input.pollLimit,
  })
}

export async function runRendiFfmpegAndDownloadBytes(input: {
  apiKey: string
  ffmpegCommand: string
  inputFiles: Record<string, string>
  outputFiles: Record<string, string>
  outputAlias: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
  maxCommandRunSeconds?: number
  vcpuCount?: number
  metadata?: Record<string, string | number | boolean>
}) {
  const apiKey = requiredApiKey(input.apiKey)
  const submitted = await submitRendiCommand(input)
  if (!submitted.command_id) {
    throw new Error("Rendi did not return a command id")
  }
  const status = await pollRendiCommand({
    apiKey,
    commandId: submitted.command_id,
    fetchImpl: input.fetchImpl,
    pollDelayMs: input.pollDelayMs,
    pollLimit: input.pollLimit,
  })
  const outputFile = status.output_files?.[input.outputAlias]
  if (!outputFile?.storage_url) {
    throw new Error("Rendi command finished without a downloadable output file")
  }
  return {
    status,
    bytes: await downloadRendiOutputBytes({
      storageUrl: outputFile.storage_url,
      fetchImpl: input.fetchImpl,
    }),
    downloadUrl: outputFile.storage_url,
  }
}

export async function downloadRendiOutputBytes(input: {
  storageUrl: string
  fetchImpl?: FetchLike
}) {
  const response = await fetchWithTimeout(input.storageUrl, undefined, {
    fetchImpl: input.fetchImpl,
    timeoutMs: 120_000,
  })
  if (!response.ok) {
    throw new Error(`Failed to download Rendi output with ${response.status}`)
  }
  return new Uint8Array(
    await readResponseBytes(
      response,
      Math.max(1, Number(process.env.RENDI_MAX_OUTPUT_BYTES ?? 1024 ** 3))
    )
  )
}

export async function submitRendiCommand(input: {
  apiKey: string
  ffmpegCommand: string
  inputFiles: Record<string, string>
  outputFiles: Record<string, string>
  fetchImpl?: FetchLike
  maxCommandRunSeconds?: number
  vcpuCount?: number
  metadata?: Record<string, string | number | boolean>
}) {
  const submitted = await rendiJson<{ command_id: string }>({
    apiKey: requiredApiKey(input.apiKey),
    path: "/v1/run-ffmpeg-command",
    method: "POST",
    body: {
      ffmpeg_command: input.ffmpegCommand,
      input_files: input.inputFiles,
      output_files: input.outputFiles,
      ...(input.maxCommandRunSeconds
        ? { max_command_run_seconds: input.maxCommandRunSeconds }
        : {}),
      ...(input.vcpuCount ? { vcpu_count: input.vcpuCount } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
    fetchImpl: input.fetchImpl,
  })
  if (!submitted.command_id)
    throw new Error("Rendi did not return a command id")
  return submitted
}

export async function getRendiFile(input: {
  apiKey: string
  fileId: string
  fetchImpl?: FetchLike
}) {
  const file = await rendiJson<RendiStoredFile>({
    apiKey: requiredApiKey(input.apiKey),
    path: `/v1/files/${encodeURIComponent(input.fileId)}`,
    fetchImpl: input.fetchImpl,
  })
  if (file.status === "FAILED") {
    throw new Error(
      file.external_error_message ||
        file.error_status ||
        "Rendi file upload failed"
    )
  }
  return file
}

export async function getRendiCommand(input: {
  apiKey: string
  commandId: string
  fetchImpl?: FetchLike
}) {
  const command = await rendiJson<RendiCommandStatus>({
    apiKey: requiredApiKey(input.apiKey),
    path: `/v1/commands/${encodeURIComponent(input.commandId)}`,
    fetchImpl: input.fetchImpl,
  })
  if (command.status === "FAILED") {
    throw new Error(
      command.error_message ||
        command.error_status ||
        "Rendi FFmpeg command failed"
    )
  }
  return command
}

export async function pollRendiFile(input: {
  apiKey: string
  fileId: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  return pollUntil(
    async () => {
      const file = await getRendiFile(input)
      return file.status === "STORED" && file.storage_url ? file : null
    },
    {
      intervalMs: input.pollDelayMs ?? DEFAULT_POLL_DELAY_MS,
      maxAttempts: input.pollLimit ?? DEFAULT_FILE_POLL_LIMIT,
      description: "Rendi file upload",
      timeoutMessage: "Rendi file upload timed out",
    }
  )
}

export async function pollRendiCommand(input: {
  apiKey: string
  commandId: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  return pollUntil(
    async () => {
      const command = await getRendiCommand(input)
      return ["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(command.status)
        ? command
        : null
    },
    {
      intervalMs: input.pollDelayMs ?? DEFAULT_POLL_DELAY_MS,
      maxAttempts: input.pollLimit ?? DEFAULT_COMMAND_POLL_LIMIT,
      description: "Rendi FFmpeg command",
      timeoutMessage: "Rendi FFmpeg command timed out",
    }
  )
}

export async function rendiJson<T>(input: {
  apiKey: string
  path: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
  fetchImpl?: FetchLike
}): Promise<T> {
  const response = await fetchWithTimeout(
    `${RENDI_API_BASE_URL}${input.path}`,
    {
      method: input.method,
      headers: {
        "X-API-KEY": requiredApiKey(input.apiKey),
        ...(input.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...input.headers,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    },
    { fetchImpl: input.fetchImpl, timeoutMs: 30_000 }
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new RendiApiError(
      response.status,
      readRendiError(payload) || `Rendi request failed with ${response.status}`,
      payload
    )
  }
  return payload as T
}

export function rendiSafeFileName(value: string) {
  const cleanName = value.replace(/[^a-zA-Z0-9_.-]/g, "_")
  return cleanName || `${randomUUID()}.bin`
}

function requiredApiKey(value: string) {
  const apiKey = cleanString(value)
  if (!apiKey) throw new Error("Missing RENDI_API_KEY")
  return apiKey
}

function readRendiError(payload: unknown) {
  const record = readLooseRecord(payload)
  const detail = record?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => readTrimmedString(readLooseRecord(item)?.msg))
      .filter(Boolean)
      .join("; ")
  }
  return readTrimmedString(record?.error) || readTrimmedString(record?.message)
}
