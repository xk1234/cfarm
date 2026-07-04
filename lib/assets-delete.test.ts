import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { deleteAssetRecordsForUrls } from "./assets"

let assetRoot: string

beforeEach(async () => {
  assetRoot = path.join(os.tmpdir(), `cfarm-asset-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(path.join(assetRoot, "files"), { recursive: true })
})

afterEach(async () => {
  await rm(assetRoot, { recursive: true, force: true })
})

describe("deleteAssetRecordsForUrls", () => {
  it("removes matching asset records and deletes their unused local files", async () => {
    await writeAsset("delete-video", "files/delete-video.webm")
    await writeAsset("keep-video", "files/keep-video.webm")
    await writeFile(path.join(assetRoot, "files", "delete-video.webm"), new Uint8Array([1, 2, 3]))
    await writeFile(path.join(assetRoot, "files", "keep-video.webm"), new Uint8Array([4, 5, 6]))

    const result = await deleteAssetRecordsForUrls({
      rootDir: assetRoot,
      urls: ["/api/local-assets/assets/files/delete-video.webm"],
    })

    const stored = JSON.parse(await readFile(path.join(assetRoot, "assets.json"), "utf8"))
    expect(result).toEqual({ deleted: 1, deletedFiles: 1 })
    expect(stored.assets.map((asset: { id: string }) => asset.id)).toEqual(["keep-video"])
    await expect(stat(path.join(assetRoot, "files", "delete-video.webm"))).rejects.toThrow()
    await expect(stat(path.join(assetRoot, "files", "keep-video.webm"))).resolves.toMatchObject({ size: 3 })
  })

  it("keeps matching assets when their URL is still referenced elsewhere", async () => {
    await writeAsset("shared-video", "files/shared-video.webm")
    await writeFile(path.join(assetRoot, "files", "shared-video.webm"), new Uint8Array([1, 2, 3]))

    const result = await deleteAssetRecordsForUrls({
      rootDir: assetRoot,
      urls: ["/api/local-assets/assets/files/shared-video.webm"],
      keepUrls: ["/api/local-assets/assets/files/shared-video.webm"],
    })

    expect(result).toEqual({ deleted: 0, deletedFiles: 0 })
    await expect(stat(path.join(assetRoot, "files", "shared-video.webm"))).resolves.toMatchObject({ size: 3 })
  })
})

async function writeAsset(id: string, relativePath: string) {
  const existing = await readAssets()
  await writeFile(path.join(assetRoot, "assets.json"), `${JSON.stringify({
    assets: [
      ...existing,
      {
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
      },
    ],
  }, null, 2)}\n`)
}

async function readAssets() {
  try {
    const data = JSON.parse(await readFile(path.join(assetRoot, "assets.json"), "utf8")) as { assets?: unknown[] }
    return data.assets ?? []
  } catch {
    return []
  }
}
