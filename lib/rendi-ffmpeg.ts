import { randomUUID } from "node:crypto"
import { open, stat, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

import {
  cleanString,
  readLooseRecord,
  readTrimmedString,
} from "@/lib/guards"
import { fetchWithTimeout } from "@/lib/http"
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

type RendiCommandStatus = {
  command_id: string
  status: string
  error_status?: string | null
  error_message?: string | null
  output_files?: Record<string, RendiStoredFile> | null
}

export function getRendiApiKey() {
  return process.env.RENDI_API_KEY?.trim() ?? ""
}

export async function uploadLocalFileToRendi(input: {
  filePath: string
  apiKey: string
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  const apiKey = cleanString(input.apiKey)
  if (!apiKey) {
    throw new Error("Missing RENDI_API_KEY")
  }

  const fileStats = await stat(input.filePath)
  if (!fileStats.isFile() || fileStats.size <= 0) {
    throw new Error("Rendi upload requires a non-empty local file")
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const initUpload = await rendiJson<{
    file_id: string
    part_size: number
    upload_urls: string[]
  }>(fetchImpl, `${RENDI_API_BASE_URL}/v1/files/init-upload`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      filename: rendiSafeFileName(path.basename(input.filePath)),
      size_bytes: fileStats.size,
    }),
  })

  if (!initUpload.file_id || initUpload.upload_urls.length === 0) {
    throw new Error("Rendi did not return upload URLs")
  }

  const file = await open(input.filePath, "r")
  const parts: Array<{ part_number: number; etag: string }> = []
  try {
    for (const [index, uploadUrl] of initUpload.upload_urls.entries()) {
      const offset = index * initUpload.part_size
      const size = Math.min(initUpload.part_size, fileStats.size - offset)
      const buffer = Buffer.alloc(size)
      await file.read(buffer, 0, size, offset)
      const uploadResponse = await fetchWithTimeout(
        uploadUrl,
        {
          method: "PUT",
          body: buffer,
        },
        {
          fetchImpl,
          timeoutMs: 120_000,
        }
      )
      if (!uploadResponse.ok) {
        throw new Error(
          `Rendi file part upload failed with ${uploadResponse.status}`
        )
      }
      const etag =
        uploadResponse.headers.get("etag") ?? uploadResponse.headers.get("ETag")
      if (!etag) {
        throw new Error("Rendi file part upload did not return an ETag")
      }
      parts.push({ part_number: index + 1, etag })
    }
  } finally {
    await file.close()
  }

  const completed = await rendiJson<RendiStoredFile>(
    fetchImpl,
    `${RENDI_API_BASE_URL}/v1/files/${encodeURIComponent(initUpload.file_id)}/complete-upload`,
    {
      method: "POST",
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ parts }),
    }
  )

  if (completed.status === "STORED" && completed.storage_url) {
    return completed
  }

  return pollRendiFile({
    apiKey,
    fileId: initUpload.file_id,
    fetchImpl,
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
  fetchImpl?: FetchLike
  pollDelayMs?: number
  pollLimit?: number
  maxCommandRunSeconds?: number
  vcpuCount?: number
  metadata?: Record<string, string | number | boolean>
}) {
  const apiKey = cleanString(input.apiKey)
  if (!apiKey) {
    throw new Error("Missing RENDI_API_KEY")
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const submitted = await rendiJson<{ command_id: string }>(
    fetchImpl,
    `${RENDI_API_BASE_URL}/v1/run-ffmpeg-command`,
    {
      method: "POST",
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({
        ffmpeg_command: input.ffmpegCommand,
        input_files: input.inputFiles,
        output_files: input.outputFiles,
        ...(input.maxCommandRunSeconds
          ? { max_command_run_seconds: input.maxCommandRunSeconds }
          : {}),
        ...(input.vcpuCount ? { vcpu_count: input.vcpuCount } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    }
  )
  if (!submitted.command_id) {
    throw new Error("Rendi did not return a command id")
  }

  const status = await pollRendiCommand({
    apiKey,
    commandId: submitted.command_id,
    fetchImpl,
    pollDelayMs: input.pollDelayMs,
    pollLimit: input.pollLimit,
  })
  const outputFile = status.output_files?.[input.outputAlias]
  if (!outputFile?.storage_url) {
    throw new Error("Rendi command finished without a downloadable output file")
  }

  const downloadResponse = await fetchWithTimeout(
    outputFile.storage_url,
    undefined,
    {
      fetchImpl,
      timeoutMs: 120_000,
    }
  )
  if (!downloadResponse.ok) {
    throw new Error(
      `Failed to download Rendi output with ${downloadResponse.status}`
    )
  }
  await mkdir(path.dirname(input.outputPath), { recursive: true })
  await writeFile(
    input.outputPath,
    Buffer.from(await downloadResponse.arrayBuffer())
  )
  return status
}

async function pollRendiFile(input: {
  apiKey: string
  fileId: string
  fetchImpl: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  const pollLimit = input.pollLimit ?? DEFAULT_FILE_POLL_LIMIT
  return pollUntil(
    async () => {
      const file = await rendiJson<RendiStoredFile>(
        input.fetchImpl,
        `${RENDI_API_BASE_URL}/v1/files/${encodeURIComponent(input.fileId)}`,
        {
          headers: authHeaders(input.apiKey),
        }
      )
      if (file.status === "FAILED") {
        throw new Error(
          file.external_error_message ||
            file.error_status ||
            "Rendi file upload failed"
        )
      }
      return file.status === "STORED" && file.storage_url ? file : null
    },
    {
      intervalMs: input.pollDelayMs ?? DEFAULT_POLL_DELAY_MS,
      maxAttempts: pollLimit,
      description: "Rendi file upload",
      timeoutMessage: "Rendi file upload timed out",
    }
  )
}

async function pollRendiCommand(input: {
  apiKey: string
  commandId: string
  fetchImpl: FetchLike
  pollDelayMs?: number
  pollLimit?: number
}) {
  const pollLimit = input.pollLimit ?? DEFAULT_COMMAND_POLL_LIMIT
  return pollUntil(
    async () => {
      const command = await rendiJson<RendiCommandStatus>(
        input.fetchImpl,
        `${RENDI_API_BASE_URL}/v1/commands/${encodeURIComponent(input.commandId)}`,
        {
          headers: authHeaders(input.apiKey),
        }
      )
      if (command.status === "FAILED") {
        throw new Error(
          command.error_message ||
            command.error_status ||
            "Rendi FFmpeg command failed"
        )
      }
      return command.status === "SUCCESS" ? command : null
    },
    {
      intervalMs: input.pollDelayMs ?? DEFAULT_POLL_DELAY_MS,
      maxAttempts: pollLimit,
      description: "Rendi FFmpeg command",
      timeoutMessage: "Rendi FFmpeg command timed out",
    }
  )
}

async function rendiJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit
): Promise<T> {
  const response = await fetchWithTimeout(url, init, {
    fetchImpl,
    timeoutMs: 30_000,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      readRendiError(payload) || `Rendi request failed with ${response.status}`
    )
  }
  return payload as T
}

function jsonHeaders(apiKey: string) {
  return {
    ...authHeaders(apiKey),
    "Content-Type": "application/json",
  }
}

function authHeaders(apiKey: string) {
  return {
    "X-API-KEY": apiKey,
  }
}

function readRendiError(payload: unknown) {
  const record = readLooseRecord(payload)
  const detail = record?.detail
  if (typeof detail === "string") {
    return detail
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => readTrimmedString(readLooseRecord(item)?.msg))
      .filter(Boolean)
      .join("; ")
  }
  return readTrimmedString(record?.error) || readTrimmedString(record?.message)
}

function rendiSafeFileName(value: string) {
  const cleanName = value.replace(/[^a-zA-Z0-9_.-]/g, "_")
  return cleanName || `${randomUUID()}.bin`
}
