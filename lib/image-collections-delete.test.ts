import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `cfarm-image-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(path.join(tempRoot, "data", "image-collections", "files"), { recursive: true })
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("deleteImageCollections", () => {
  it("removes selected collection records and deletes their unused local files", async () => {
    await writeImageCollectionsDb([
      {
        name: "Keep",
        created_at: "2026-07-03T00:00:00.000Z",
        images: [
          {
            image_link: "/api/local-assets/image-collections/files/shared.jpg",
            caption: "Shared",
          },
        ],
      },
      {
        name: "Delete me",
        created_at: "2026-07-03T01:00:00.000Z",
        images: [
          {
            image_link: "/api/local-assets/image-collections/files/delete-me.jpg",
            caption: "Local",
          },
          {
            image_link: "/api/local-assets/image-collections/files/shared.jpg",
            caption: "Shared",
          },
          {
            image_link: "https://images.example.com/remote.jpg",
            caption: "Remote",
          },
        ],
      },
    ])
    await writeLocalFile("delete-me.jpg")
    await writeLocalFile("shared.jpg")

    const { deleteImageCollections } = await import("./image-collections")
    const result = await deleteImageCollections([
      { name: "Delete me", created_at: "2026-07-03T01:00:00.000Z" },
    ])

    const stored = JSON.parse(await readFile(path.join(tempRoot, "data", "image-collections.json"), "utf8"))
    expect(result).toEqual({ deleted: 1, deletedFiles: 1 })
    expect(stored.collections.map((collection: { name: string }) => collection.name)).toEqual(["Keep"])
    await expect(stat(path.join(tempRoot, "data", "image-collections", "files", "delete-me.jpg"))).rejects.toThrow()
    await expect(stat(path.join(tempRoot, "data", "image-collections", "files", "shared.jpg"))).resolves.toMatchObject({ size: 3 })
  })
})

describe("upsertImageCollection", () => {
  it("deletes local files removed from an existing collection record", async () => {
    await writeImageCollectionsDb([
      {
        name: "Edit me",
        created_at: "2026-07-03T02:00:00.000Z",
        images: [
          {
            image_link: "/api/local-assets/image-collections/files/remove-this.jpg",
            caption: "Remove",
          },
          {
            image_link: "/api/local-assets/image-collections/files/keep-this.jpg",
            caption: "Keep",
          },
        ],
      },
    ])
    await writeLocalFile("remove-this.jpg")
    await writeLocalFile("keep-this.jpg")

    const { upsertImageCollection } = await import("./image-collections")
    await upsertImageCollection({
      name: "Edit me",
      created_at: "2026-07-03T02:00:00.000Z",
      images: [
        {
          image_link: "/api/local-assets/image-collections/files/keep-this.jpg",
          caption: "Keep",
        },
      ],
    })

    await expect(stat(path.join(tempRoot, "data", "image-collections", "files", "remove-this.jpg"))).rejects.toThrow()
    await expect(stat(path.join(tempRoot, "data", "image-collections", "files", "keep-this.jpg"))).resolves.toMatchObject({ size: 3 })
  })
})

async function writeImageCollectionsDb(collections: unknown[]) {
  await mkdir(path.join(tempRoot, "data"), { recursive: true })
  await writeFile(path.join(tempRoot, "data", "image-collections.json"), `${JSON.stringify({ collections }, null, 2)}\n`)
}

async function writeLocalFile(fileName: string) {
  await writeFile(path.join(tempRoot, "data", "image-collections", "files", fileName), new Uint8Array([1, 2, 3]))
}
