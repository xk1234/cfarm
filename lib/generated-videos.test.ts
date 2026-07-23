import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import {
  createGeneratedVideoExport,
  deleteGeneratedVideoExport,
  listGeneratedVideoExports,
  markGeneratedVideoExportPublished,
  updateGeneratedVideoExport,
} from "@/lib/generated-videos"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/generated-videos/exports.json -> generated_video_exports
//   data/assets/assets.json            -> assets
const videoRoot = path.join(process.cwd(), "data", "generated-videos")
const assetRoot = path.join(process.cwd(), "data", "assets")

const clearAll = () => clearTestTables("generated_video_exports", "assets")

beforeEach(clearAll)
afterAll(clearAll)

describe("generated video exports", () => {
  it("creates processing exports and lists newest first", async () => {
    const greenscreen = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Greenscreen meme",
      description: "caption",
      sourceConfig: { textPlacement: "top" },
      previewUrl: "/preview.jpg",
      videoUrl: "/source.mp4",
    })
    const ugcAd = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "ugc_ad",
      title: "UGC ad",
      description: "hook",
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

    const listed = await listGeneratedVideoExports({
      rootDir: videoRoot,
      type: "greenscreen",
    })
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
      description: "hook",
      sourceConfig: { demo: "Landing page" },
    })

    await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "greenscreen",
      title: "Greenscreen",
      description: "caption",
      sourceConfig: {},
    })

    const updated = await updateGeneratedVideoExport({
      rootDir: videoRoot,
      id: exportRecord.id,
      status: "ready",
      videoUrl: "/api/local-assets/generated-videos/files/output.mp4",
    })

    expect(updated?.status).toBe("ready")

    const listed = await listGeneratedVideoExports({
      rootDir: videoRoot,
      type: "ugc_ad",
    })
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

  it("persists a manual published status without scheduling the export", async () => {
    const exportRecord = await createGeneratedVideoExport({
      rootDir: videoRoot,
      type: "template_video",
      title: "Button-generated video",
      status: "ready",
      videoUrl: "/api/local-assets/generated-videos/files/manual.mp4",
    })
    const publishedAt = new Date("2026-07-15T12:00:00.000Z")

    const updated = await markGeneratedVideoExportPublished({
      rootDir: videoRoot,
      id: exportRecord.id,
      publishedAt,
    })

    expect(updated?.manuallyPublishedAt).toBe(publishedAt.toISOString())
    expect(updated?.status).toBe("ready")
    expect(updated).not.toHaveProperty("scheduledAt")
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

    expect(updated?.previewUrl).toBe(
      "/api/local-assets/assets/files/rendered-thumbnail.jpg"
    )
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

  it("deletes generated output asset records that no remaining export references", async () => {
    await writeJsonArrayStore({
      rootDir: assetRoot,
      fileName: "assets.json",
      key: "assets",
      records: [
        assetRecord("output-video", "files/output.webm"),
        assetRecord("output-thumbnail", "files/output-thumbnail.jpg"),
      ],
    })
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

    const remainingAssets = await readJsonArrayStore({
      rootDir: assetRoot,
      fileName: "assets.json",
      key: "assets",
    })
    expect(deleted?.id).toBe(first.id)
    expect(remainingAssets).toEqual([])
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
