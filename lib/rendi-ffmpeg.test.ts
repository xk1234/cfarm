import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  runRendiFfmpegAndDownload,
  uploadLocalFileToRendi,
} from "@/lib/rendi-ffmpeg"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-rendi-"))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("rendi ffmpeg client", () => {
  it("uploads a local file through Rendi multipart upload and returns stored metadata", async () => {
    const filePath = path.join(tempRoot, "input video.mp4")
    await writeFile(filePath, Buffer.from("video-file"))

    const fetchMock = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href === "https://api.rendi.dev/v1/files/init-upload") {
          expect(init?.method).toBe("POST")
          expect(init?.headers).toMatchObject({
            "Content-Type": "application/json",
            "X-API-KEY": "test-rendi-key",
          })
          expect(JSON.parse(String(init?.body))).toEqual({
            filename: "input_video.mp4",
            size_bytes: 10,
          })
          return Response.json({
            file_id: "file-1",
            part_size: 5,
            upload_urls: [
              "https://upload.example.com/part-1",
              "https://upload.example.com/part-2",
            ],
          })
        }
        if (href.startsWith("https://upload.example.com/")) {
          return new Response(null, {
            status: 200,
            headers: { ETag: `"${path.basename(href)}"` },
          })
        }
        if (href === "https://api.rendi.dev/v1/files/file-1/complete-upload") {
          expect(JSON.parse(String(init?.body))).toEqual({
            parts: [
              { part_number: 1, etag: '"part-1"' },
              { part_number: 2, etag: '"part-2"' },
            ],
          })
          return Response.json({ file_id: "file-1", status: "UPLOADED" })
        }
        if (href === "https://api.rendi.dev/v1/files/file-1") {
          return Response.json({
            file_id: "file-1",
            status: "STORED",
            duration: 5.4,
            storage_url: "https://storage.rendi.dev/input.mp4",
          })
        }
        return new Response("unexpected request", { status: 500 })
      }
    )

    await expect(
      uploadLocalFileToRendi({
        filePath,
        apiKey: "test-rendi-key",
        fetchImpl: fetchMock,
        pollDelayMs: 0,
      })
    ).resolves.toMatchObject({
      file_id: "file-1",
      duration: 5.4,
      storage_url: "https://storage.rendi.dev/input.mp4",
    })
  })

  it("submits an FFmpeg command, polls completion, and downloads the selected output", async () => {
    const outputPath = path.join(tempRoot, "out", "final.mp4")
    const fetchMock = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href === "https://api.rendi.dev/v1/run-ffmpeg-command") {
          expect(init?.method).toBe("POST")
          expect(init?.headers).toMatchObject({ "X-API-KEY": "test-rendi-key" })
          expect(JSON.parse(String(init?.body))).toMatchObject({
            ffmpeg_command: "-i {{in_video}} {{out_video}}",
            input_files: { in_video: "https://storage.rendi.dev/input.mp4" },
            output_files: { out_video: "final.mp4" },
          })
          return Response.json({ command_id: "command-1" })
        }
        if (href === "https://api.rendi.dev/v1/commands/command-1") {
          return Response.json({
            command_id: "command-1",
            status: "SUCCESS",
            output_files: {
              out_video: {
                file_id: "out-file-1",
                storage_url: "https://storage.rendi.dev/final.mp4",
              },
            },
          })
        }
        if (href === "https://storage.rendi.dev/final.mp4") {
          return new Response(Buffer.from("rendered-video"), { status: 200 })
        }
        return new Response("unexpected request", { status: 500 })
      }
    )

    await runRendiFfmpegAndDownload({
      apiKey: "test-rendi-key",
      fetchImpl: fetchMock,
      ffmpegCommand: "-i {{in_video}} {{out_video}}",
      inputFiles: { in_video: "https://storage.rendi.dev/input.mp4" },
      outputFiles: { out_video: "final.mp4" },
      outputAlias: "out_video",
      outputPath,
      pollDelayMs: 0,
    })

    await expect(readFile(outputPath, "utf8")).resolves.toBe("rendered-video")
  })
})
