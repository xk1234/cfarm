import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `cfarm-character-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(path.join(tempRoot, "data", "characters", "headshots"), { recursive: true })
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
