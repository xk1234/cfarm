import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { deleteAssetRecordsForUrls } from "./assets"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only: `data/assets/assets.json` -> `assets` table, run against
// cfarm (forced by vitest.setup.ts). Media lives in Storage, so deletion
// is asserted via the returned counts + remaining records, not local disk.
const assetRoot = path.join(process.cwd(), "data", "assets")
const TABLE = "assets"

const clearAssets = () => clearTestTables(TABLE)

beforeEach(clearAssets)
afterAll(clearAssets)

describe("deleteAssetRecordsForUrls", () => {
  it("removes matching asset records and reports their unused files", async () => {
    await seedAssets([
      assetRecord("delete-video", "files/delete-video.webm"),
      assetRecord("keep-video", "files/keep-video.webm"),
    ])

    const result = await deleteAssetRecordsForUrls({
      rootDir: assetRoot,
      urls: ["/api/local-assets/assets/files/delete-video.webm"],
    })

    expect(result).toEqual({ deleted: 1, deletedFiles: 1 })
    expect(await remainingIds()).toEqual(["keep-video"])
  })

  it("keeps matching assets when their URL is still referenced elsewhere", async () => {
    await seedAssets([assetRecord("shared-video", "files/shared-video.webm")])

    const result = await deleteAssetRecordsForUrls({
      rootDir: assetRoot,
      urls: ["/api/local-assets/assets/files/shared-video.webm"],
      keepUrls: ["/api/local-assets/assets/files/shared-video.webm"],
    })

    expect(result).toEqual({ deleted: 0, deletedFiles: 0 })
    expect(await remainingIds()).toEqual(["shared-video"])
  })
})

function assetRecord(id: string, relativePath: string) {
  return {
    id,
    kind: "video",
    source: "upload",
    status: "ready",
    scope: "greenscreen",
    category: "other",
    name: id,
    caption: "",
    fileName: path.basename(relativePath),
    fileUrl: `/api/local-assets/assets/${relativePath}`,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  }
}

async function seedAssets(records: unknown[]) {
  await writeJsonArrayStore({
    rootDir: assetRoot,
    fileName: "assets.json",
    key: "assets",
    records,
  })
}

async function remainingIds() {
  const records = await readJsonArrayStore<{ id: string }>({
    rootDir: assetRoot,
    fileName: "assets.json",
    key: "assets",
  })
  return records.map((record) => record.id)
}
