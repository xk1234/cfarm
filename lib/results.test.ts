import path from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { clearTestTables } from "@/lib/test-helpers"
import {
  countResultRecords,
  createResultRecord,
  deleteResultRecord,
  deleteResultRecordsForAutomation,
  listResultRecords,
} from "@/lib/results"

// Appwrite-only: the store maps `data/results/results.json` -> the `results`
// table, so tests use the real data root and run against cfarm (forced by
// vitest.setup.ts). Rows are cleared between tests for isolation.
const rootDir = path.join(process.cwd(), "data", "results")
const TABLE = "results"

const clearResults = () => clearTestTables(TABLE)

beforeEach(clearResults)
afterAll(clearResults)

describe("result persistence", () => {
  it("creates and lists canonical automation output results", async () => {
    const result = await createResultRecord({
      rootDir,
      automationId: "automation-1",
      runId: "automation-run-1",
      workflowType: "slideshow",
      title: "Generated study tips",
      status: "succeeded",
      artifacts: {
        slideshowId: "slideshow-1",
        outputDir: "/api/local-assets/slideshows/outputs/slideshow-1",
        outputImages: [
          "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        ],
        thumbnailUrl:
          "/api/local-assets/slideshows/outputs/slideshow-1/thumbnail.png",
      },
      payload: {
        type: "slideshow",
        caption: "Try these before your next exam.",
        hashtags: "#study",
        prompt: "Study smarter",
        imageCollectionId: "collection-study",
        slideshowType: "automation",
        settings: {
          duration: 4,
          aspect_ratio: "9:16",
          font: "TikTok Display Medium",
          background_color: "#000000",
          transition_style: "fade",
          export_as_video: false,
          sound_id: "",
          sound_name: "",
          sound_url: "",
        },
        slides: [
          {
            id: "slide-1",
            image_url:
              "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
            source_image_url:
              "/api/local-assets/slideshows/outputs/slideshow-1/source-001.jpg",
            textItems: [],
          },
        ],
      },
    })

    const records = await listResultRecords({ rootDir })
    const filtered = await listResultRecords({
      rootDir,
      automationId: "automation-1",
      runId: "automation-run-1",
    })
    const filteredBySlideshow = await listResultRecords({
      rootDir,
      slideshowIds: ["slideshow-1", "slideshow-missing"],
    })

    expect(result).toMatchObject({
      id: "result-automation-run-1",
      automationId: "automation-1",
      runId: "automation-run-1",
      workflowType: "slideshow",
      status: "succeeded",
      title: "Generated study tips",
      artifacts: {
        slideshowId: "slideshow-1",
        outputImages: [
          "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        ],
      },
      payload: {
        type: "slideshow",
        caption: "Try these before your next exam.",
      },
    })
    expect(records).toHaveLength(1)
    expect(filtered).toHaveLength(1)
    expect(filteredBySlideshow.map((record) => record.id)).toEqual([result.id])
  })

  it("deletes results by id and automation id", async () => {
    const first = await createResultRecord({
      rootDir,
      automationId: "automation-delete",
      runId: "run-delete-1",
      workflowType: "slideshow",
      title: "Delete me",
      status: "succeeded",
      artifacts: { outputImages: [] },
    })
    await createResultRecord({
      rootDir,
      automationId: "automation-delete",
      runId: "run-delete-2",
      workflowType: "video",
      title: "Delete me too",
      status: "succeeded",
      artifacts: { videoUrl: "/video.mp4", outputImages: [] },
    })
    const keep = await createResultRecord({
      rootDir,
      automationId: "automation-keep",
      runId: "run-keep",
      workflowType: "slideshow",
      title: "Keep me",
      status: "succeeded",
      artifacts: { outputImages: [] },
    })

    const deletedOne = await deleteResultRecord({ rootDir, id: first.id })
    const deletedRest = await deleteResultRecordsForAutomation({
      rootDir,
      automationId: "automation-delete",
    })
    const records = await listResultRecords({ rootDir })

    expect(deletedOne?.id).toBe(first.id)
    expect(deletedRest.map((result) => result.runId)).toEqual(["run-delete-2"])
    expect(records.map((result) => result.id)).toEqual([keep.id])
  })

  it("counts slideshow and video-export rows without hydrating results", async () => {
    await createResultRecord({
      rootDir,
      automationId: "automation-count",
      runId: "run-count-video",
      workflowType: "slideshow",
      title: "Video slideshow",
      artifacts: { videoUrl: "/slideshow.mp4", outputImages: [] },
    })
    await createResultRecord({
      rootDir,
      automationId: "automation-count",
      runId: "run-count-static",
      workflowType: "slideshow",
      title: "Static slideshow",
      artifacts: { outputImages: [] },
    })
    await createResultRecord({
      rootDir,
      automationId: "automation-count",
      runId: "run-count-other-video",
      workflowType: "video",
      title: "Standalone video",
      artifacts: { videoUrl: "/video.mp4", outputImages: [] },
    })

    await expect(
      countResultRecords({ rootDir, workflowType: "slideshow" })
    ).resolves.toBe(2)
    await expect(
      countResultRecords({
        rootDir,
        workflowType: "slideshow",
        hasVideo: true,
      })
    ).resolves.toBe(1)
  })
})
