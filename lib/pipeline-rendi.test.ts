import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  completeRendiSessionUpload,
  downloadRendiOutputToTemp,
  getRendiFfmpegStatus,
  getRendiUploadStatus,
  initializeRendiUploadSession,
  submitRendiFfmpeg,
  uploadRendiSessionPart,
} from "@/lib/pipeline-rendi"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true }))
  )
})

describe("atomic Rendi protocol primitives", () => {
  it("uses exactly one fetch for each create, part, complete, status, submit, poll, and download boundary", async () => {
    const inputDir = await mkdtemp(
      path.join(os.tmpdir(), "cfarm-provider-test-")
    )
    tempDirs.push(inputDir)
    const localFilePath = path.join(inputDir, "input.mp4")
    await writeFile(localFilePath, "input-bytes")

    const initFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        file_id: "file-1",
        part_size: 1024,
        upload_urls: ["https://upload.rendi.example/part-1"],
      })
    )
    const initialized = await initializeRendiUploadSession({
      apiKey: "rendi-key",
      localFilePath,
      fetchImpl: initFetch,
    })
    tempDirs.push(path.dirname(initialized.uploadSessionPath))
    expect(initFetch).toHaveBeenCalledOnce()
    expect(JSON.stringify(initialized)).not.toContain("upload.rendi.example")

    const partFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 200, headers: { etag: "etag-1" } })
      )
    const part = await uploadRendiSessionPart({
      uploadSessionPath: initialized.uploadSessionPath,
      localFilePath,
      partNumber: 1,
      fileSize: initialized.fileSize,
      fetchImpl: partFetch,
    })
    expect(partFetch).toHaveBeenCalledOnce()

    const completeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ file_id: "file-1", status: "PROCESSING" })
      )
    await completeRendiSessionUpload({
      apiKey: "rendi-key",
      fileId: "file-1",
      parts: [part],
      fetchImpl: completeFetch,
    })
    expect(completeFetch).toHaveBeenCalledOnce()

    const fileFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        file_id: "file-1",
        status: "STORED",
        storage_url: "https://storage.rendi.example/input.mp4",
      })
    )
    await getRendiUploadStatus({
      apiKey: "rendi-key",
      fileId: "file-1",
      fetchImpl: fileFetch,
    })
    expect(fileFetch).toHaveBeenCalledOnce()

    const submitFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ command_id: "command-1" }))
    await submitRendiFfmpeg({
      apiKey: "rendi-key",
      ffmpegCommand: "ffmpeg -i {{in}} {{out}}",
      inputFiles: { in: "https://storage.rendi.example/input.mp4" },
      outputFiles: { out: "output.mp4" },
      fetchImpl: submitFetch,
    })
    expect(submitFetch).toHaveBeenCalledOnce()

    const pollFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        command_id: "command-1",
        status: "SUCCESS",
        output_files: {
          out: {
            file_id: "output-1",
            storage_url: "https://storage.rendi.example/output.mp4",
          },
        },
      })
    )
    await getRendiFfmpegStatus({
      apiKey: "rendi-key",
      commandId: "command-1",
      fetchImpl: pollFetch,
    })
    expect(pollFetch).toHaveBeenCalledOnce()

    const downloadFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("output-bytes", { status: 200 }))
    const downloaded = await downloadRendiOutputToTemp({
      remoteUrl: "https://storage.rendi.example/output.mp4",
      commandId: "command-1",
      fileName: "output.mp4",
      fetchImpl: downloadFetch,
    })
    tempDirs.push(path.dirname(downloaded.tempPath))
    expect(downloadFetch).toHaveBeenCalledOnce()
  })
})
