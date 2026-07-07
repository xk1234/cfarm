import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `cfarm-character-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(path.join(tempRoot, "data", "characters", "headshots"), { recursive: true })
  await mkdir(path.join(tempRoot, "data", "characters", "images"), { recursive: true })
  await mkdir(path.join(tempRoot, "data", "characters", "videos"), { recursive: true })
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("deleteCharacter", () => {
  it("removes the character record and deletes its unused local preview file", async () => {
    await writeCharactersDb([
      characterRecord(1, "Maya", "/api/local-assets/characters/headshots/maya.png"),
      characterRecord(2, "Keep", "/api/local-assets/characters/headshots/keep.png"),
    ])
    await writeFile(path.join(tempRoot, "data", "characters", "headshots", "maya.png"), new Uint8Array([1, 2, 3]))
    await writeFile(path.join(tempRoot, "data", "characters", "headshots", "keep.png"), new Uint8Array([4, 5, 6]))

    const { deleteCharacter } = await import("./characters")
    const result = await deleteCharacter(1)

    const stored = JSON.parse(await readFile(path.join(tempRoot, "data", "characters.json"), "utf8"))
    expect(result).toEqual({ deleted: true, deletedFiles: 1 })
    expect(stored.characters.map((character: { id: number }) => character.id)).toEqual([2])
    await expect(stat(path.join(tempRoot, "data", "characters", "headshots", "maya.png"))).rejects.toThrow()
    await expect(stat(path.join(tempRoot, "data", "characters", "headshots", "keep.png"))).resolves.toMatchObject({ size: 3 })
  })

  it("keeps a local preview file when another character still references it", async () => {
    await writeCharactersDb([
      characterRecord(1, "Maya", "/api/local-assets/characters/headshots/shared.png"),
      characterRecord(2, "Keep", "/api/local-assets/characters/headshots/shared.png"),
    ])
    await writeFile(path.join(tempRoot, "data", "characters", "headshots", "shared.png"), new Uint8Array([1, 2, 3]))

    const { deleteCharacter } = await import("./characters")
    const result = await deleteCharacter(1)

    expect(result).toEqual({ deleted: true, deletedFiles: 0 })
    await expect(stat(path.join(tempRoot, "data", "characters", "headshots", "shared.png"))).resolves.toMatchObject({ size: 3 })
  })

  it("deletes generated character image records and local output files for the deleted character", async () => {
    await writeCharactersDb([
      characterRecord(1, "Maya", "/api/local-assets/characters/headshots/maya.png"),
      characterRecord(2, "Keep", "/api/local-assets/characters/headshots/keep.png"),
    ])
    await writeFile(path.join(tempRoot, "data", "characters", "headshots", "maya.png"), new Uint8Array([1]))
    await writeFile(path.join(tempRoot, "data", "characters", "headshots", "keep.png"), new Uint8Array([2]))
    await writeFile(path.join(tempRoot, "data", "characters", "images", "maya.png"), new Uint8Array([3]))
    await writeFile(path.join(tempRoot, "data", "characters", "videos", "maya.mp4"), new Uint8Array([4]))
    await writeFile(path.join(tempRoot, "data", "characters", "images", "keep.png"), new Uint8Array([5]))
    await writeFile(
      path.join(tempRoot, "data", "characters", "images.json"),
      `${JSON.stringify(
        {
          generations: [
            characterGeneration("maya-generation", 1, "maya.png", "maya.mp4"),
            characterGeneration("keep-generation", 2, "keep.png"),
          ],
        },
        null,
        2
      )}\n`
    )

    const { deleteCharacter } = await import("./characters")
    const result = await deleteCharacter(1)

    const storedGenerations = JSON.parse(
      await readFile(path.join(tempRoot, "data", "characters", "images.json"), "utf8")
    )
    expect(result).toEqual({ deleted: true, deletedFiles: 3 })
    expect(storedGenerations.generations.map((generation: { id: string }) => generation.id)).toEqual(["keep-generation"])
    await expect(stat(path.join(tempRoot, "data", "characters", "images", "maya.png"))).rejects.toThrow()
    await expect(stat(path.join(tempRoot, "data", "characters", "videos", "maya.mp4"))).rejects.toThrow()
    await expect(stat(path.join(tempRoot, "data", "characters", "images", "keep.png"))).resolves.toMatchObject({ size: 1 })
  })
})

async function writeCharactersDb(characters: unknown[]) {
  await mkdir(path.join(tempRoot, "data"), { recursive: true })
  await writeFile(path.join(tempRoot, "data", "characters.json"), `${JSON.stringify({ characters }, null, 2)}\n`)
}

function characterRecord(id: number, name: string, preview_url: string) {
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

function characterGeneration(id: string, characterId: number, imageFile: string, videoFile?: string) {
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
    videoUrl: videoFile ? `/api/local-assets/characters/videos/${videoFile}` : undefined,
    progress: 100,
  }
}
