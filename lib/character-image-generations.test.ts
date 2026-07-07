import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string
let charactersRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-generation-delete-"))
  charactersRoot = path.join(tempRoot, "data", "characters")
  await mkdir(path.join(charactersRoot, "images"), { recursive: true })
  await mkdir(path.join(charactersRoot, "videos"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("deleteCharacterImageGeneration", () => {
  it("removes one generation record and deletes its unused local image and video files", async () => {
    await writeFile(
      path.join(charactersRoot, "images", "delete.png"),
      new Uint8Array([1])
    )
    await writeFile(
      path.join(charactersRoot, "videos", "delete.mp4"),
      new Uint8Array([2])
    )
    await writeFile(
      path.join(charactersRoot, "videos", "delete-raw.mp4"),
      new Uint8Array([4])
    )
    await writeFile(
      path.join(charactersRoot, "images", "keep.png"),
      new Uint8Array([3])
    )
    await writeGenerations([
      {
        ...generationRecord("delete-me", "delete.png", "delete.mp4"),
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

    const { deleteCharacterImageGeneration } =
      await import("./character-image-generations")
    const result = await deleteCharacterImageGeneration({
      rootDir: charactersRoot,
      id: "delete-me",
    })

    const stored = JSON.parse(
      await readFile(path.join(charactersRoot, "images.json"), "utf8")
    ) as { generations: Array<{ id: string }> }
    expect(result).toEqual({ deleted: true, deletedFiles: 3 })
    expect(stored.generations.map((generation) => generation.id)).toEqual([
      "keep-me",
    ])
    await expect(
      stat(path.join(charactersRoot, "images", "delete.png"))
    ).rejects.toThrow()
    await expect(
      stat(path.join(charactersRoot, "videos", "delete.mp4"))
    ).rejects.toThrow()
    await expect(
      stat(path.join(charactersRoot, "videos", "delete-raw.mp4"))
    ).rejects.toThrow()
    await expect(
      stat(path.join(charactersRoot, "images", "keep.png"))
    ).resolves.toMatchObject({ size: 1 })
  })

  it("keeps local files still referenced by another generation", async () => {
    await writeFile(
      path.join(charactersRoot, "images", "shared.png"),
      new Uint8Array([1])
    )
    await writeGenerations([
      generationRecord("delete-me", "shared.png"),
      generationRecord("keep-me", "shared.png"),
    ])

    const { deleteCharacterImageGeneration } =
      await import("./character-image-generations")
    const result = await deleteCharacterImageGeneration({
      rootDir: charactersRoot,
      id: "delete-me",
    })

    expect(result).toEqual({ deleted: true, deletedFiles: 0 })
    await expect(
      stat(path.join(charactersRoot, "images", "shared.png"))
    ).resolves.toMatchObject({ size: 1 })
  })
})

async function writeGenerations(generations: unknown[]) {
  await writeFile(
    path.join(charactersRoot, "images.json"),
    `${JSON.stringify({ generations }, null, 2)}\n`
  )
}

function generationRecord(id: string, imageFile: string, videoFile?: string) {
  return {
    id,
    characterId: 1,
    prompt: "Prompt",
    model: "Flux 2",
    createdAt: "2026-07-05T00:00:00.000Z",
    attachments: [],
    aspectRatio: "9:16",
    status: "ready",
    imageUrl: `/api/local-assets/characters/images/${imageFile}`,
    videoUrl: videoFile
      ? `/api/local-assets/characters/videos/${videoFile}`
      : undefined,
    progress: 100,
  }
}
