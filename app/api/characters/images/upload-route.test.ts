import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-character-image-upload-")
  )
  await mkdir(path.join(tempRoot, "data", "characters"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/characters/images", () => {
  it("stores a dropped image file as a character generation", async () => {
    const formData = new FormData()
    formData.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "source.png", {
        type: "image/png",
      })
    )
    formData.set("characterId", "12")
    formData.set("aspectRatio", "4:5")

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/characters/images", {
        method: "POST",
        body: formData,
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.generation).toMatchObject({
      characterId: 12,
      model: "Uploaded image",
      aspectRatio: "4:5",
      status: "ready",
      imageUrl: payload.imageUrl,
    })
    expect(payload.imageUrl).toMatch(
      /^\/api\/local-assets\/characters\/images\/\d+-uploaded-source\.png$/
    )
    await expect(
      stat(
        path.join(
          tempRoot,
          "data",
          "characters",
          "images",
          path.basename(payload.imageUrl)
        )
      )
    ).resolves.toMatchObject({ size: 4 })

    const stored = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "characters", "images.json"),
        "utf8"
      )
    ) as { generations: Array<{ id: string; imageUrl: string }> }
    expect(stored.generations).toHaveLength(1)
    expect(stored.generations[0]?.imageUrl).toBe(payload.imageUrl)
  })
})
