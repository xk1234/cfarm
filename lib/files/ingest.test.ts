import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"

import { ingestMedia, MediaRejectedError } from "./ingest"

const WS = "user_ingest"

async function png() {
  return new Uint8Array(
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#ff0000" } }).png().toBuffer()
  )
}

describe("ingestMedia", () => {
  it("rejects non-image bytes even when declared as video", async () => {
    const repos = createMemoryRepositories()
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>")
    for (const mime of ["video/mp4", "video/quicktime", "video/webm", "image/png"]) {
      await expect(
        ingestMedia(repos, WS, { bytes: html, mime, source: "upload", createdBy: WS })
      ).rejects.toBeInstanceOf(MediaRejectedError)
    }
    expect((await repos.media.list(WS, {})).items).toEqual([])
  })

  it("stores images by their sniffed type, ignoring the declared one", async () => {
    const repos = createMemoryRepositories()
    const { value } = await ingestMedia(repos, WS, {
      bytes: await png(),
      mime: "video/mp4",
      source: "upload",
      createdBy: WS,
    })
    expect(value).toMatchObject({ kind: "image", mimeType: "image/png", width: 4, height: 3 })
  })
})
