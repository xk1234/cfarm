import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import {
  deleteCharacterImageGeneration,
} from "@/lib/character-image-generations"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only: the store maps `data/characters/images.json` -> the
// `character_generations` table, and the split-out video generation lives in
// `character_video_generations` (`data/characters/videos.json`). Tests use the
// real data root and run against cfarm (forced by vitest.setup.ts). Media
// lives in Storage, so deletion is asserted via the returned `deletedFiles`
// count and remaining records, not local disk state.
const rootDir = path.join(process.cwd(), "data", "characters")
const TABLE = "character_generations"
const VIDEO_TABLE = "character_video_generations"


const clearGenerations = () => clearTestTables(TABLE, VIDEO_TABLE)

async function seedGenerations(generations: unknown[]) {
  await writeJsonArrayStore({
    rootDir,
    fileName: "images.json",
    key: "generations",
    records: generations,
  })
}

async function seedVideos(videos: unknown[]) {
  await writeJsonArrayStore({
    rootDir,
    fileName: "videos.json",
    key: "videos",
    records: videos,
  })
}

async function remainingIds() {
  const records = await readJsonArrayStore<{ id: string }>({
    rootDir,
    fileName: "images.json",
    key: "generations",
  })
  return records.map((record) => record.id)
}

async function remainingVideoIds() {
  const records = await readJsonArrayStore<{ generationId: string }>({
    rootDir,
    fileName: "videos.json",
    key: "videos",
  })
  return records.map((record) => record.generationId)
}

beforeEach(clearGenerations)
afterAll(clearGenerations)

describe("deleteCharacterImageGeneration", () => {
  it("removes one generation record and cascades its unused media + video", async () => {
    await seedGenerations([
      {
        ...generationRecord("delete-me", "delete.png"),
        workflowMetadata: {
          workflow: "pose_variation_cut_video",
          workflowLabel: "Pose Cut Video",
          recipe: {
            rawVideoUrl: "/api/local-assets/characters/videos/delete-raw.mp4",
            originalImageUrl:
              "/api/local-assets/characters/headshots/source.png",
          },
        },
      },
      generationRecord("keep-me", "keep.png"),
    ])
    await seedVideos([
      videoRecord("delete-me", "delete.mp4"),
      videoRecord("keep-me", "keep.mp4"),
    ])

    const result = await deleteCharacterImageGeneration({
      rootDir,
      id: "delete-me",
    })

    // image (delete.png) + recipe rawVideoUrl + cascaded video (delete.mp4)
    expect(result).toEqual({ deleted: true, deletedFiles: 3 })
    expect(await remainingIds()).toEqual(["keep-me"])
    expect(await remainingVideoIds()).toEqual(["keep-me"])
  })

  it("keeps media still referenced by another generation", async () => {
    await seedGenerations([
      generationRecord("delete-me", "shared.png"),
      generationRecord("keep-me", "shared.png"),
    ])

    const result = await deleteCharacterImageGeneration({
      rootDir,
      id: "delete-me",
    })

    expect(result).toEqual({ deleted: true, deletedFiles: 0 })
    expect(await remainingIds()).toEqual(["keep-me"])
  })
})

function generationRecord(id: string, imageFile: string) {
  return {
    id,
    characterId: "1",
    prompt: "Prompt",
    model: "Flux 2",
    createdAt: "2026-07-05T00:00:00.000Z",
    attachments: [],
    aspectRatio: "9:16",
    status: "ready",
    imageUrl: `/api/local-assets/characters/images/${imageFile}`,
    progress: 100,
  }
}

function videoRecord(generationId: string, videoFile: string) {
  return {
    id: generationId,
    generationId,
    characterId: "1",
    videoUrl: `/api/local-assets/characters/videos/${videoFile}`,
    model: "Kling 2.6",
    status: "ready",
    progress: 100,
    createdAt: "2026-07-05T00:00:00.000Z",
  }
}
