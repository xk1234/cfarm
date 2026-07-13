import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { deleteCharacter } from "@/lib/characters"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/characters.json         -> characters
//   data/characters/images.json  -> character_generations
// Media lives in Storage, so deletion is asserted via counts + remaining rows.
const dataDir = path.join(process.cwd(), "data")
const charactersDir = path.join(process.cwd(), "data", "characters")


const clearAll = () => clearTestTables("characters", "character_generations", "character_video_generations")

beforeEach(clearAll)
afterAll(clearAll)

async function seedCharacters(characters: unknown[]) {
  await writeJsonArrayStore({
    rootDir: dataDir,
    fileName: "characters.json",
    key: "characters",
    records: characters,
  })
}

async function seedGenerations(generations: unknown[]) {
  await writeJsonArrayStore({
    rootDir: charactersDir,
    fileName: "images.json",
    key: "generations",
    records: generations,
  })
}

async function seedVideos(videos: unknown[]) {
  await writeJsonArrayStore({
    rootDir: charactersDir,
    fileName: "videos.json",
    key: "videos",
    records: videos,
  })
}

async function remainingCharacterIds() {
  const records = await readJsonArrayStore<{ id: string }>({
    rootDir: dataDir,
    fileName: "characters.json",
    key: "characters",
  })
  return records.map((record) => record.id)
}

async function remainingGenerationIds() {
  const records = await readJsonArrayStore<{ id: string }>({
    rootDir: charactersDir,
    fileName: "images.json",
    key: "generations",
  })
  return records.map((record) => record.id)
}

describe("deleteCharacter", () => {
  it("removes the character record and reports its unused preview file", async () => {
    await seedCharacters([
      characterRecord("1", "Maya", "/api/local-assets/characters/headshots/maya.png"),
      characterRecord("2", "Keep", "/api/local-assets/characters/headshots/keep.png"),
    ])

    const result = await deleteCharacter("1")

    expect(result).toEqual({ deleted: true, deletedFiles: 1 })
    expect(await remainingCharacterIds()).toEqual(["2"])
  })

  it("keeps a preview file when another character still references it", async () => {
    await seedCharacters([
      characterRecord("1", "Maya", "/api/local-assets/characters/headshots/shared.png"),
      characterRecord("2", "Keep", "/api/local-assets/characters/headshots/shared.png"),
    ])

    const result = await deleteCharacter("1")

    expect(result).toEqual({ deleted: true, deletedFiles: 0 })
    expect(await remainingCharacterIds()).toEqual(["2"])
  })

  it("deletes generated image records and reports output files for the deleted character", async () => {
    await seedCharacters([
      characterRecord("1", "Maya", "/api/local-assets/characters/headshots/maya.png"),
      characterRecord("2", "Keep", "/api/local-assets/characters/headshots/keep.png"),
    ])
    await seedGenerations([
      characterGeneration("maya-generation", "1", "maya.png"),
      characterGeneration("keep-generation", "2", "keep.png"),
    ])
    await seedVideos([characterVideo("maya-generation", "1", "maya.mp4")])

    const result = await deleteCharacter("1")

    // preview headshots/maya.png + generation images/maya.png + video maya.mp4
    expect(result).toEqual({ deleted: true, deletedFiles: 3 })
    expect(await remainingGenerationIds()).toEqual(["keep-generation"])
  })
})

function characterRecord(id: string, name: string, preview_url: string) {
  return {
    id,
    user_id: "103073708745629128582",
    name,
    attributes: { name, age: 28, ethnicity: "east asian", gender: "female" },
    collection_id: null,
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    preview_url,
  }
}

function characterGeneration(id: string, characterId: string, imageFile: string) {
  return {
    id,
    characterId,
    prompt: "Prompt",
    model: "Flux 2",
    createdAt: "2026-07-03T00:00:00.000Z",
    attachments: [],
    aspectRatio: "9:16",
    status: "ready",
    imageUrl: `/api/local-assets/characters/images/${imageFile}`,
    progress: 100,
  }
}

function characterVideo(generationId: string, characterId: string, videoFile: string) {
  return {
    id: generationId,
    generationId,
    characterId,
    videoUrl: `/api/local-assets/characters/videos/${videoFile}`,
    model: "Kling 2.6",
    status: "ready",
    progress: 100,
    createdAt: "2026-07-03T00:00:00.000Z",
  }
}
