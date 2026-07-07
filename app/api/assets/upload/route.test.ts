import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-asset-upload-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/assets/upload", () => {
  it("stores uploaded avatar motion reference videos as assets", async () => {
    const { POST } = await import("./route")
    const formData = new FormData()
    formData.set(
      "file",
      new File([new Uint8Array([0, 0, 0, 24])], "motion-ref.mp4", {
        type: "video/mp4",
      })
    )
    formData.set("scope", "ugc_avatar")
    formData.set("category", "reference")
    formData.set("name", "motion ref")

    const response = await POST(
      new Request("http://localhost/api/assets/upload", {
        method: "POST",
        body: formData,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.asset).toMatchObject({
      kind: "video",
      scope: "ugc_avatar",
      category: "reference",
      source: "upload",
      status: "ready",
      name: "motion ref",
      mimeType: "video/mp4",
    })
    expect(payload.asset.fileUrl).toMatch(
      /^\/api\/local-assets\/assets\/files\/\d+-.*\.mp4$/
    )

    const savedFile = path.join(
      tempRoot,
      "data",
      "assets",
      "files",
      decodeURIComponent(path.basename(payload.asset.fileUrl))
    )
    await expect(stat(savedFile)).resolves.toMatchObject({ size: 4 })

    const stored = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "assets", "assets.json"),
        "utf8"
      )
    )
    expect(stored.assets).toHaveLength(1)
    expect(stored.assets[0]).toMatchObject({
      id: payload.asset.id,
      fileUrl: payload.asset.fileUrl,
      kind: "video",
      scope: "ugc_avatar",
      category: "reference",
    })
  })
})
