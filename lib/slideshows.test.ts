import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { mirrorAssetToAppwrite, readAssetBytes } from "@/lib/asset-storage"
import { readJsonArrayStore } from "@/lib/json-store"
import type * as SlideshowsModule from "@/lib/slideshows"

// Loaded dynamically after cwd is mocked so the module captures the temp root
// (it derives its default data dir from process.cwd() at import time).
let createSlideshowRecord: typeof SlideshowsModule.createSlideshowRecord
let deleteSlideshowRecord: typeof SlideshowsModule.deleteSlideshowRecord
let deleteSlideshowRecordsForAutomation: typeof SlideshowsModule.deleteSlideshowRecordsForAutomation
let listSlideshowRecords: typeof SlideshowsModule.listSlideshowRecords

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/slideshows/slideshows.json -> slideshows, results -> results;
//   rendered slide output -> Storage.
// Slides are rasterized to PNG only where a rasterizer is available (darwin);
// elsewhere the served slide is the SVG source.
const slideExt = process.platform === "darwin" ? "png" : "svg"
let rootDir: string

const clearAll = () => clearTestTables("slideshows", "results")

async function readOutputText(
  record: { id: string },
  fileName: string
): Promise<string> {
  const bytes = await readAssetBytes(outputPath(rootDir, record, fileName))
  return Buffer.from(bytes).toString("utf8")
}

beforeEach(async () => {
  await clearAll()
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-slideshows-"))
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(rootDir)
  vi.doMock("@/lib/rendi-ffmpeg", async () => {
    const { writeFile } = await import("node:fs/promises")
    return {
      getRendiApiKey: () => "test-rendi-key",
      uploadLocalFileToRendi: vi.fn(
        async ({ filePath }: { filePath: string }) => ({
          file_id: path.basename(filePath),
          status: "STORED",
          storage_url: `https://rendi.test/${path.basename(filePath)}`,
        })
      ),
      runRendiFfmpegAndDownload: vi.fn(
        async ({ outputPath }: { outputPath: string }) => {
          await writeFile(outputPath, Buffer.from("fake mp4"))
          return outputPath
        }
      ),
    }
  })
  ;({
    createSlideshowRecord,
    deleteSlideshowRecord,
    deleteSlideshowRecordsForAutomation,
    listSlideshowRecords,
  } = await import("@/lib/slideshows"))
  await writeLocalAsset("first.jpg", "first image")
  await writeLocalAsset("slide.jpg", "slide image")
  await writeLocalAsset(
    "scene.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#111827"/><circle cx="540" cy="960" r="320" fill="#4ade80"/></svg>`
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(rootDir, { recursive: true, force: true })
})

afterAll(clearAll)

describe("slideshow persistence", () => {
  it("persists generated slide metadata in the DB and only writes media outputs", async () => {
    const record = await createSlideshowRecord({
      automationId: "automation-1",
      runId: "automation-run-1",
      title: "New Slideshow",
      caption: "Generated caption",
      hashtags: "#focus #study",
      prompt: "I want 12 slides about discipline",
      image_collection: "community_collection_12470",
      slideshow_type: "educational",
      settings: {
        duration: 4,
        background_color: "#000000",
        is_bg_overlay_on: false,
        transition_style: "hard",
        is_bg_overlay_on_hook_image: false,
      },
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          aspect_ratio: "4:5",
          time_length_ms: 2000,
          textItems: [
            {
              id: "text-1",
              text: "WAIT. you're giving up???",
              font: "TikTok Display Medium",
              fontSize: "10px",
              textSize: { width: 80, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 16 },
            },
          ],
        },
      ],
    })

    const records = await listSlideshowRecords({})
    const resultsRows = await readJsonArrayStore<Record<string, unknown>>({
      rootDir: path.join(rootDir, "data", "results"),
      fileName: "results.json",
      key: "results",
    })

    expect(record).toMatchObject({
      title: "New Slideshow",
      caption: "Generated caption",
      hashtags: "#focus #study",
      automationId: "automation-1",
      status: "exported",
      prompt: "I want 12 slides about discipline",
      image_collection: "community_collection_12470",
      slideshow_type: "educational",
      settings: {
        duration: 4,
        transition_style: "hard",
      },
    })
    expect(records).toHaveLength(1)
    expect(records[0].images[0]).toMatchObject({
      image_url: `/api/local-assets/slideshows/outputs/${record.id}/slide-001.${slideExt}`,
      source_image_url: `/api/local-assets/slideshows/outputs/${record.id}/source-001.jpg`,
      aspect_ratio: "4:5",
      time_length_ms: 2000,
      textItems: [
        {
          text: "WAIT. you're giving up???",
          fontSize: "10px",
          textStyle: "outline",
          textPosition: { x: 50, y: 16 },
        },
      ],
    })
    const legacyRenderKey = ["render", "url"].join("_")
    expect(Object.prototype.hasOwnProperty.call(record, legacyRenderKey)).toBe(
      false
    )
    expect(record.output_dir).toBe(
      `/api/local-assets/slideshows/outputs/${record.id}`
    )
    expect(record.output_images).toEqual([
      `/api/local-assets/slideshows/outputs/${record.id}/slide-001.${slideExt}`,
    ])
    expect(resultsRows).toHaveLength(1)
    expect(resultsRows[0]).toMatchObject({
      id: "result-automation-run-1",
      automationId: "automation-1",
      runId: "automation-run-1",
      workflowType: "slideshow",
      status: "succeeded",
      artifacts: {
        slideshowId: record.id,
        outputImages: [
          `/api/local-assets/slideshows/outputs/${record.id}/slide-001.${slideExt}`,
        ],
      },
      payload: {
        type: "slideshow",
        caption: "Generated caption",
        imageCollectionId: "community_collection_12470",
      },
    })
    const outputImage = await readOutputText(record, "slide-001.svg")
    expect(outputImage).toContain("WAIT. you&apos;re giving up???")
    expect(outputImage).toContain('href="data:image/jpeg;base64,')
    expect(outputImage).not.toContain(
      `/api/local-assets/slideshows/outputs/${record.id}/source-001.jpg`
    )
    // No slideshow.json metadata sidecar is mirrored into the output folder.
    await expect(
      readAssetBytes(outputPath(rootDir, record, "slideshow.json"))
    ).rejects.toThrow()
  })

  it("deletes generated slideshow output folders for an automation without touching other slideshows", async () => {
    const first = await createSlideshowRecord({
      automationId: "automation-delete",
      title: "Delete 1",
    })
    const second = await createSlideshowRecord({
      automationId: "automation-delete",
      title: "Delete 2",
    })
    const keep = await createSlideshowRecord({
      automationId: "automation-keep",
      title: "Keep",
    })

    const deleted = await deleteSlideshowRecordsForAutomation({
      automationId: "automation-delete",
    })
    const records = await listSlideshowRecords({})

    expect(deleted.map((record) => record.title).sort()).toEqual([
      "Delete 1",
      "Delete 2",
    ])
    expect(records.map((record) => record.title)).toEqual(["Keep"])
    void first
    void second
    void keep
  })

  it("deletes slideshow records by id", async () => {
    const record = await createSlideshowRecord({
      title: "Delete me",
      prompt: "delete prompt",
      images: [],
    })

    const deleted = await deleteSlideshowRecord({ id: record.id })
    const records = await listSlideshowRecords({})

    expect(deleted?.id).toBe(record.id)
    expect(records).toEqual([])
  })

  it("renders output slides with configured aspect ratio and bounded text lines", async () => {
    const record = await createSlideshowRecord({
      title: "Bounded text",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          aspect_ratio: "4:5",
          textItems: [
            {
              id: "text-1",
              text: "the note-taking method that helped me go from c's to straight a's in one semester",
              font: "TikTok Display Medium",
              fontSize: "15px",
              textSize: { width: 80, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 50 },
            },
          ],
        },
      ],
    })

    const outputImage = await readOutputText(record, "slide-001.svg")

    expect(outputImage).toContain('width="1080" height="1350"')
    expect(outputImage).toContain('viewBox="0 0 1080 1350"')
    expect(outputImage).not.toContain("textLength=")
    expect(outputImage).not.toContain("lengthAdjust=")
    expect(outputImage).not.toContain(
      '<tspan x="540" dy="0">the note-taking method that helped me go from c&apos;s to straight a&apos;s in one semester</tspan>'
    )
  })

  it("uses the actual local image file type when the source extension is wrong", async () => {
    const mislabeledPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64"
    )
    await writeLocalAsset("mislabeled.jpg", mislabeledPng)

    const record = await createSlideshowRecord({
      title: "Mislabeled image",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/mislabeled.jpg",
          textItems: [
            {
              id: "text-1",
              text: "hook text",
              font: "TikTok Display Medium",
              fontSize: "10px",
              textSize: { width: 56, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 18 },
            },
          ],
        },
      ],
    })

    expect(record.images[0].source_image_url).toBe(
      `/api/local-assets/slideshows/outputs/${record.id}/source-001.png`
    )

    const outputImage = await readOutputText(record, "slide-001.svg")
    expect(outputImage).toContain('href="data:image/png;base64,')
    expect(outputImage).not.toContain('href="data:image/jpeg;base64,')
  })

  it("transcodes WebP sources before embedding them in rendered SVGs", async () => {
    const sharp = (await import("sharp")).default
    const webp = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 235, g: 170, b: 70 },
      },
    })
      .webp()
      .toBuffer()
    await writeLocalAsset("curtains.webp", webp)

    const record = await createSlideshowRecord({
      title: "WebP curtain slide",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/curtains.webp",
          textItems: [],
        },
      ],
    })

    expect(record.images[0].source_image_url).toContain("source-001.webp")
    const outputSvg = await readOutputText(record, "slide-001.svg")
    expect(outputSvg).toContain('href="data:image/png;base64,')
    expect(outputSvg).not.toContain('href="data:image/webp;base64,')
  })

  it("wraps translated CJK text to the configured text box width", async () => {
    const text =
      "使用计时器，学习25分钟后休息5分钟。这有助于保持大脑清醒，并专注于学习。"
    const record = await createSlideshowRecord({
      title: "Translated text",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          textItems: [
            {
              id: "text-1",
              text,
              font: "TikTok Display Medium",
              fontSize: "14px",
              textSize: { width: 80, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 45 },
            },
          ],
        },
      ],
    })

    const outputImage = await readOutputText(record, "slide-001.svg")

    expect(outputImage).not.toContain(`<tspan x="540" dy="0">${text}</tspan>`)
    expect(outputImage.match(/<tspan/g)?.length).toBeGreaterThan(1)
  })

  it("renders automation text style names in exported slide SVGs", async () => {
    const record = await createSlideshowRecord({
      title: "Styled automation text",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          textItems: [
            {
              id: "white-text",
              text: "white editor text",
              font: "TikTok Display Medium",
              fontSize: "12px",
              textSize: { width: 70, height: 18 },
              textStyle: "whiteText",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 30 },
            },
            {
              id: "yellow-text",
              text: "yellow editor text",
              font: "TikTok Display Medium",
              fontSize: "12px",
              textSize: { width: 70, height: 18 },
              textStyle: "yellowText",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 70 },
            },
          ],
        },
      ],
    })

    const outputImage = await readOutputText(record, "slide-001.svg")

    expect(outputImage).toMatch(/<text[^>]*font-size="48"[^>]*fill="#ffffff"/)
    expect(outputImage).toMatch(/<text[^>]*font-size="48"[^>]*fill="#fff176"/)
  })

  it("renders configured overlay images in exported slide SVGs", async () => {
    await writeLocalAsset(
      "overlay.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#ff00ff"/></svg>`
    )

    const record = await createSlideshowRecord({
      title: "Overlay image",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          aspect_ratio: "9:16",
          overlayImage: {
            image_url: "/api/local-assets/image-collections/files/overlay.svg",
            padding: 10,
          },
          textItems: [],
        },
      ],
    })

    const outputImage = await readOutputText(record, "slide-001.svg")

    expect(outputImage.match(/<image /g)).toHaveLength(2)
    expect(outputImage).toContain('x="108"')
    expect(outputImage).toContain('width="864"')
    expect(outputImage).toContain('height="486"')
  })

  it("stacks text boxes that share the same slide position", async () => {
    const record = await createSlideshowRecord({
      title: "Stacked text",
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/first.jpg",
          textItems: [
            {
              id: "title",
              text: "4. 安排短暂的定时学习休息时间",
              font: "TikTok Display Medium",
              fontSize: "14px",
              textSize: { width: 80, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 45 },
            },
            {
              id: "body",
              text: "使用计时器，学习25分钟后休息5分钟。这有助于保持大脑清醒，并专注于学习。",
              font: "TikTok Display Medium",
              fontSize: "12px",
              textSize: { width: 80, height: 18 },
              textStyle: "outline",
              textAlign: "center",
              textAnchor: "padded",
              textPosition: { x: 50, y: 45 },
            },
          ],
        },
      ],
    })

    const outputImage = await readOutputText(record, "slide-001.svg")
    const yValues = Array.from(
      outputImage.matchAll(/<text [^>]*x="540" y="([^"]+)"/g)
    ).map((match) => Number(match[1]))

    expect(yValues).toHaveLength(2)
    expect(yValues[0]).toBeLessThan(yValues[1])
  })

  it("persists video export settings with selected TikTok sound metadata", async () => {
    const record = await createSlideshowRecord({
      title: "Video slideshow",
      settings: {
        duration: 3,
        transition_style: "fade",
        export_as_video: true,
        sound_id: "sound-123",
        sound_name: "TikTok trend sound",
        sound_url: "/api/local-assets/music/files/trend.mp3",
      },
      images: [
        {
          image_url: "/api/local-assets/image-collections/files/slide.jpg",
        },
      ],
      video_url: "/api/local-assets/assets/files/slideshow-video.webm",
      thumbnail_url:
        "/api/local-assets/assets/files/slideshow-video-thumbnail.jpg",
    })

    expect(record.settings).toMatchObject({
      duration: 3,
      transition_style: "fade",
      export_as_video: true,
      sound_id: "sound-123",
      sound_name: "TikTok trend sound",
      sound_url: "/api/local-assets/music/files/trend.mp3",
    })
    expect(record.video_url).toBe(
      "/api/local-assets/assets/files/slideshow-video.webm"
    )
    expect(record.thumbnail_url).toBe(
      "/api/local-assets/assets/files/slideshow-video-thumbnail.jpg"
    )
    expect(record.images[0].time_length_ms).toBe(3000)
  })

  it.runIf(process.platform === "darwin")(
    "renders slideshow PNG frames and a video into the output folder",
    async () => {
      const record = await createSlideshowRecord({
        title: "Rendered video slideshow",
        settings: {
          duration: 1,
          transition_style: "fade",
          export_as_video: true,
        },
        images: [
          {
            image_url: "/api/local-assets/image-collections/files/scene.svg",
            textItems: [
              {
                id: "text-1",
                text: "how to stop caring what people think",
                font: "TikTok Display Medium",
                fontSize: "10px",
                textSize: { width: 56, height: 18 },
                textStyle: "outline",
                textAlign: "center",
                textAnchor: "padded",
                textPosition: { x: 50, y: 18 },
              },
            ],
          },
        ],
      })

      expect(record.output_images).toEqual([
        `/api/local-assets/slideshows/outputs/${record.id}/slide-001.${slideExt}`,
      ])
      expect(record.images[0].image_url).toBe(record.output_images[0])
      expect(record.video_url).toBe(
        `/api/local-assets/slideshows/outputs/${record.id}/slideshow-export.mp4`
      )
      expect(record.thumbnail_url).toBe(
        `/api/local-assets/slideshows/outputs/${record.id}/slideshow-thumbnail.png`
      )
      await expect(
        readAssetBytes(outputPath(rootDir, record, "slide-001.png"))
      ).resolves.toBeTruthy()
      await expect(
        readAssetBytes(outputPath(rootDir, record, "slideshow-export.mp4"))
      ).resolves.toBeTruthy()
    }
  )
})

async function writeLocalAsset(fileName: string, value: string | Uint8Array) {
  const abs = path.join("data", "image-collections", "files", fileName)
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value
  await mirrorAssetToAppwrite(abs, bytes)
}

function outputDir(rootDir: string, record: { id: string }) {
  return path.join(rootDir, "data", "slideshows", "outputs", record.id)
}

function outputPath(rootDir: string, record: { id: string }, fileName: string) {
  return path.join(outputDir(rootDir, record), fileName)
}
