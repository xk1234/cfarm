import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-character-images-route-")
  )
  await mkdir(path.join(tempRoot, "data", "characters", "images"), {
    recursive: true,
  })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("DELETE /api/characters/images", () => {
  it("deletes a generation record and its local file", async () => {
    await writeFile(
      path.join(tempRoot, "data", "characters", "images", "delete.png"),
      new Uint8Array([1])
    )
    await writeFile(
      path.join(tempRoot, "data", "characters", "images.json"),
      `${JSON.stringify(
        {
          generations: [
            {
              id: "delete-me",
              characterId: 1,
              prompt: "Prompt",
              model: "Flux 2",
              createdAt: "2026-07-05T00:00:00.000Z",
              attachments: [],
              aspectRatio: "9:16",
              status: "ready",
              imageUrl: "/api/local-assets/characters/images/delete.png",
              progress: 100,
            },
          ],
        },
        null,
        2
      )}\n`
    )

    const { DELETE } = await import("./route")
    const response = await DELETE(
      new Request("http://localhost/api/characters/images?id=delete-me", {
        method: "DELETE",
      })
    )
    const payload = await response.json()

    const stored = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "characters", "images.json"),
        "utf8"
      )
    ) as { generations: unknown[] }
    expect(response.status).toBe(200)
    expect(payload).toEqual({ deleted: true, deletedFiles: 1 })
    expect(stored.generations).toEqual([])
    await expect(
      stat(path.join(tempRoot, "data", "characters", "images", "delete.png"))
    ).rejects.toThrow()
  })
})
