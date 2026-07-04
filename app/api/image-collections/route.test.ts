import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `cfarm-image-route-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(path.join(tempRoot, "data", "image-collections", "files"), { recursive: true })
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("DELETE /api/image-collections", () => {
  it("deletes selected collection records and their local collection files", async () => {
    await writeFile(path.join(tempRoot, "data", "image-collections", "files", "collection-image.jpg"), new Uint8Array([1, 2, 3]))
    await writeFile(path.join(tempRoot, "data", "image-collections.json"), JSON.stringify({
      collections: [
        {
          name: "Delete me",
          created_at: "2026-07-03T01:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/collection-image.jpg",
              caption: "",
            },
          ],
        },
      ],
    }))

    const { DELETE } = await import("./route")
    const response = await DELETE(new Request("http://localhost/api/image-collections", {
      method: "DELETE",
      body: JSON.stringify({
        collections: [{ name: "Delete me", created_at: "2026-07-03T01:00:00.000Z" }],
      }),
    }))
    const payload = await response.json()
    const stored = JSON.parse(await readFile(path.join(tempRoot, "data", "image-collections.json"), "utf8"))

    expect(response.status).toBe(200)
    expect(payload).toEqual({ deleted: 1, deletedFiles: 1 })
    expect(stored.collections).toEqual([])
    await expect(stat(path.join(tempRoot, "data", "image-collections", "files", "collection-image.jpg"))).rejects.toThrow()
  })
})
