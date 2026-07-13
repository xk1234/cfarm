import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import {
  deleteCharacterVideoGenerationForGeneration,
  deleteCharacterVideoGenerationsForCharacter,
  listCharacterVideoGenerations,
  upsertCharacterVideoGeneration,
} from "@/lib/character-video-generations"

// Appwrite-only: maps `data/characters/videos.json` -> character_video_generations,
// run against cfarm (forced by vitest.setup.ts).
const rootDir = path.join(process.cwd(), "data", "characters")
const TABLE = "character_video_generations"

const clearVideos = () => clearTestTables(TABLE)

beforeEach(clearVideos)
afterAll(clearVideos)

describe("character video generation store", () => {
  it("upserts one video per generation id and lists by character", async () => {
    await upsertCharacterVideoGeneration({
      rootDir,
      generationId: "gen-1",
      characterId: "char-a",
      videoUrl: "/api/local-assets/characters/videos/one.mp4",
      model: "Kling 2.6",
      status: "processing",
      progress: 40,
      createdAt: "2026-07-05T00:00:00.000Z",
    })
    // Re-upsert the same generation id replaces rather than duplicates.
    await upsertCharacterVideoGeneration({
      rootDir,
      generationId: "gen-1",
      characterId: "char-a",
      videoUrl: "/api/local-assets/characters/videos/one.mp4",
      model: "Kling 2.6",
      status: "ready",
      progress: 100,
      createdAt: "2026-07-05T00:00:00.000Z",
    })
    await upsertCharacterVideoGeneration({
      rootDir,
      generationId: "gen-2",
      characterId: "char-b",
      videoUrl: "/api/local-assets/characters/videos/two.mp4",
      status: "ready",
      createdAt: "2026-07-05T00:00:00.000Z",
    })

    const forA = await listCharacterVideoGenerations({
      rootDir,
      characterId: "char-a",
    })
    expect(forA).toHaveLength(1)
    expect(forA[0]).toMatchObject({
      generationId: "gen-1",
      status: "ready",
      progress: 100,
    })

    const all = await listCharacterVideoGenerations({ rootDir })
    expect(all.map((video) => video.generationId).sort()).toEqual([
      "gen-1",
      "gen-2",
    ])
  })

  it("deletes videos for a generation id and reports unused files", async () => {
    await upsertCharacterVideoGeneration({
      rootDir,
      generationId: "gen-1",
      characterId: "char-a",
      videoUrl: "/api/local-assets/characters/videos/one.mp4",
      status: "ready",
      createdAt: "2026-07-05T00:00:00.000Z",
    })

    const result = await deleteCharacterVideoGenerationForGeneration({
      rootDir,
      generationIds: ["gen-1"],
    })
    expect(result).toEqual({ deleted: 1, deletedFiles: 1 })
    expect(await listCharacterVideoGenerations({ rootDir })).toEqual([])
  })

  it("deletes all videos for a character", async () => {
    await upsertCharacterVideoGeneration({
      rootDir,
      generationId: "gen-1",
      characterId: "char-a",
      videoUrl: "/api/local-assets/characters/videos/one.mp4",
      status: "ready",
      createdAt: "2026-07-05T00:00:00.000Z",
    })
    await upsertCharacterVideoGeneration({
      rootDir,
      generationId: "gen-2",
      characterId: "char-a",
      status: "failed",
      createdAt: "2026-07-05T00:00:00.000Z",
    })

    const result = await deleteCharacterVideoGenerationsForCharacter({
      rootDir,
      characterId: "char-a",
    })
    // one.mp4 is a local asset; gen-2 has no video file.
    expect(result).toEqual({ deleted: 2, deletedFiles: 1 })
    expect(await listCharacterVideoGenerations({ rootDir })).toEqual([])
  })
})
