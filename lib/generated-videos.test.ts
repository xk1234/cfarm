import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createGeneratedVideoExport,
  deleteGeneratedVideoExport,
  listGeneratedVideoExports,
  updateGeneratedVideoExport,
} from "@/lib/generated-videos"

let videoRoot: string
let assetRoot: string

beforeEach(async () => {
  videoRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-generated-videos-"))
  assetRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-generated-video-assets-"))
})

afterEach(async () => {
  await rm(videoRoot, { recursive: true, force: true })
  await rm(assetRoot, { recursive: true, force: true })
})

describe("generated video exports", () => {
  it("creates processing exports and lists newest first", async () => {
    const greenscreen = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Greenscreen meme",
      caption: "caption",
      sourceConfig: { textPlacement: "top" },
      previewUrl: "/preview.jpg",
      videoUrl: "/source.mp4",
    })
    const ugcAd = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "ugc_ad",
      title: "UGC ad",
      caption: "hook",
      sourceConfig: { avatar: "Maya" },
    })

    expect(greenscreen.status).toBe("queued")
    expect(ugcAd.status).toBe("queued")

    const listed = await listGeneratedVideoExports({ rootDir: videoRoot })
    expect(listed.map((item) => item.id)).toEqual([ugcAd.id, greenscreen.id])
    expect(listed[0].sourceConfig).toEqual({ avatar: "Maya" })
  })

  it("queues new video exports with stable positions", async () => {
    const first = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "ugc_ad",
      title: "First UGC ad",
    })
    const second = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Second greenscreen",
    })

    expect(first.status).toBe("queued")
    expect(first.queuePosition).toBe(1)
    expect(second.status).toBe("queued")
    expect(second.queuePosition).toBe(2)

    const listed = await listGeneratedVideoExports({ rootDir: videoRoot })
    expect(listed.map((item) => [item.title, item.queuePosition])).toEqual([
      ["Second greenscreen", 2],
      ["First UGC ad", 1],
    ])
  })

  it("persists explicit processing status for in-flight browser renders", async () => {
    const exportRecord = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "In-flight greenscreen",
      status: "processing",
    })

    expect(exportRecord.status).toBe("processing")
    expect(exportRecord.queuePosition).toBe(1)

    const listed = await listGeneratedVideoExports({ rootDir: videoRoot, type: "greenscreen" })
    expect(listed[0]).toMatchObject({
      id: exportRecord.id,
      status: "processing",
    })
  })

  it("filters by generated video type and persists status updates", async () => {
    const exportRecord = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "ugc_ad",
      title: "UGC ad",
      caption: "hook",
      sourceConfig: { demo: "Landing page" },
    })

    await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Greenscreen",
      caption: "caption",
      sourceConfig: {},
    })

    const updated = await updateGeneratedVideoExport({
      rootDir: videoRoot,
      id: exportRecord.id,
      status: "ready",
      videoUrl: "/api/local-assets/generated-videos/files/output.mp4",
    })

    expect(updated?.status).toBe("ready")

    const listed = await listGeneratedVideoExports({ rootDir: videoRoot, type: "ugc_ad" })
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: exportRecord.id,
      status: "ready",
      videoUrl: "/api/local-assets/generated-videos/files/output.mp4",
    })
  })

  it("can create a ready export when rendered media already exists", async () => {
    const exportRecord = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Rendered greenscreen",
      status: "ready",
      videoUrl: "/api/local-assets/assets/files/rendered-greenscreen.webm",
    })

    expect(exportRecord).toMatchObject({
      status: "ready",
      videoUrl: "/api/local-assets/assets/files/rendered-greenscreen.webm",
      queuePosition: undefined,
    })
  })

  it("does not persist remote media URLs in preview or background image fields", async () => {
    const exportRecord = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Remote background",
      status: "processing",
      previewUrl: "https://i.pinimg.com/originals/background.jpg",
      sourceConfig: {
        background: {
          imageUrl: "https://i.pinimg.com/originals/background.jpg",
          sourceUrl: "https://i.pinimg.com/originals/background.jpg",
        },
      },
      videoUrl: "https://cdn.pinterest.com/rendered.webm",
    })

    expect(exportRecord.previewUrl).toBeUndefined()
    expect(exportRecord.videoUrl).toBeUndefined()
    expect(exportRecord.sourceConfig).toEqual({
      background: {},
    })

    const updated = await updateGeneratedVideoExport({
      rootDir: videoRoot,
      id: exportRecord.id,
      status: "ready",
      previewUrl: "/api/local-assets/assets/files/rendered-thumbnail.jpg",
      videoUrl: "https://cdn.pinterest.com/rendered.webm",
    })

    expect(updated?.previewUrl).toBe("/api/local-assets/assets/files/rendered-thumbnail.jpg")
    expect(updated?.videoUrl).toBeUndefined()
    expect(updated?.sourceConfig).toEqual({
      background: {
        imageUrl: "/api/local-assets/assets/files/rendered-thumbnail.jpg",
      },
    })
  })

  it("deletes a generated video export without removing other outputs", async () => {
    const first = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "ugc_ad",
      title: "AI UGC output",
    })
    const second = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Greenscreen output",
    })

    const deleted = await deleteGeneratedVideoExport({
      rootDir: videoRoot,
      id: first.id,
    })

    expect(deleted?.id).toBe(first.id)

    const listed = await listGeneratedVideoExports({ rootDir: videoRoot })
    expect(listed.map((item) => item.id)).toEqual([second.id])
  })

  it("deletes generated output asset records and files that no remaining export references", async () => {
    await mkdir(path.join(assetRoot, "files"), { recursive: true })
    await writeFile(path.join(assetRoot, "files", "output.webm"), new Uint8Array([1, 2, 3]))
    await writeFile(path.join(assetRoot, "files", "output-thumbnail.jpg"), new Uint8Array([4, 5, 6]))
    await writeFile(path.join(assetRoot, "assets.json"), `${JSON.stringify({
      assets: [
        assetRecord("output-video", "files/output.webm"),
        assetRecord("output-thumbnail", "files/output-thumbnail.jpg"),
      ],
    }, null, 2)}\n`)
    const first = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "ugc_ad",
      title: "AI UGC output",
      status: "ready",
      previewUrl: "/api/local-assets/assets/files/output-thumbnail.jpg",
      videoUrl: "/api/local-assets/assets/files/output.webm",
    })

    const deleted = await deleteGeneratedVideoExport({
      rootDir: videoRoot,
      assetRootDir: assetRoot,
      id: first.id,
    })

    const assets = JSON.parse(await readFile(path.join(assetRoot, "assets.json"), "utf8"))
    expect(deleted?.id).toBe(first.id)
    expect(assets.assets).toEqual([])
    await expect(stat(path.join(assetRoot, "files", "output.webm"))).rejects.toThrow()
    await expect(stat(path.join(assetRoot, "files", "output-thumbnail.jpg"))).rejects.toThrow()
  })
})

function assetRecord(id: string, relativePath: string) {
  return {
    id,
    kind: relativePath.endsWith(".jpg") ? "image" : "video",
    source: "upload",
    status: "ready",
    scope: "ugc_ad",
    category: "other",
    name: id,
    caption: "",
    fileName: path.basename(relativePath),
    fileUrl: `/api/local-assets/assets/${relativePath}`,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  }
}
