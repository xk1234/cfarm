import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import { readJsonArrayStore } from "@/lib/json-store"

// Appwrite-only: `data/assets/assets.json` -> `assets` table, media -> Storage.
// Run against cfarm (forced by vitest.setup.ts). cwd is mocked so the
// route's data-relative paths map to the same table this test reads.
let tempRoot: string

const clearAssets = () => clearTestTables("assets")

beforeEach(async () => {
  await clearAssets()
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-asset-upload-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearAssets)

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

    const stored = await readJsonArrayStore<{ id: string; fileUrl: string }>({
      rootDir: path.join(tempRoot, "data", "assets"),
      fileName: "assets.json",
      key: "assets",
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      id: payload.asset.id,
      fileUrl: payload.asset.fileUrl,
      kind: "video",
      scope: "ugc_avatar",
      category: "reference",
    })

    // Clean up the uploaded Storage fixture.
    await deleteAssetFromAppwrite(
      path.join(
        tempRoot,
        "data",
        "assets",
        "files",
        decodeURIComponent(path.basename(payload.asset.fileUrl))
      )
    )
  })
})
