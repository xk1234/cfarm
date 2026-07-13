import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import { readJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/characters/images.json -> character_generations; media -> Storage.
let tempRoot: string

async function clearGenerations() {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured for tests.")
  for (;;) {
    const res = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "character_generations",
      [Query.limit(100)]
    )
    for (const row of res.rows) {
      await aw.tables.deleteRow(
        APPWRITE_DATABASE_ID,
        "character_generations",
        String(row.$id)
      )
    }
    if (res.rows.length < 100) break
  }
}

beforeEach(async () => {
  await clearGenerations()
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-character-image-upload-")
  )
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearGenerations)

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
      characterId: "12",
      model: "Uploaded image",
      aspectRatio: "4:5",
      status: "ready",
      imageUrl: payload.imageUrl,
    })
    expect(payload.imageUrl).toMatch(
      /^\/api\/local-assets\/characters\/images\/\d+-uploaded-source\.png$/
    )

    const stored = await readJsonArrayStore<{ id: string; imageUrl: string }>({
      rootDir: path.join(tempRoot, "data", "characters"),
      fileName: "images.json",
      key: "generations",
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]?.imageUrl).toBe(payload.imageUrl)

    await deleteAssetFromAppwrite(
      path.join(
        tempRoot,
        "data",
        "characters",
        "images",
        path.basename(payload.imageUrl)
      )
    )
  })
})
