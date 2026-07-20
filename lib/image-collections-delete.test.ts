import { rm } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import {
  mirrorAssetToAppwrite,
  readAssetBytes,
} from "@/lib/asset-storage"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/image-collections.json -> image_collections; media -> Storage.
let tempRoot: string

const clearCollections = () => clearTestTables("image_collections")

beforeEach(async () => {
  await clearCollections()
  tempRoot = path.join(
    os.tmpdir(),
    `cfarm-image-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearCollections)

function filePath(fileName: string) {
  return path.join(tempRoot, "data", "image-collections", "files", fileName)
}

async function seedCollections(collections: unknown[]) {
  await writeJsonArrayStore({
    rootDir: path.join(tempRoot, "data"),
    fileName: "image-collections.json",
    key: "collections",
    records: collections,
  })
}

async function seedFile(fileName: string) {
  await mirrorAssetToAppwrite(filePath(fileName), new Uint8Array([1, 2, 3]))
}

async function storedCollectionNames() {
  const records = await readJsonArrayStore<{ name: string }>({
    rootDir: path.join(tempRoot, "data"),
    fileName: "image-collections.json",
    key: "collections",
  })
  return records.map((record) => record.name)
}

describe("deleteImageCollections", () => {
  it("soft deletes selected collections without removing their media", async () => {
    await seedCollections([
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
            image_link:
              "/api/local-assets/image-collections/files/delete-me.jpg",
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
    await seedFile("delete-me.jpg")
    await seedFile("shared.jpg")

    const { deleteImageCollections } = await import("./image-collections")
    const result = await deleteImageCollections([
      { name: "Delete me", created_at: "2026-07-03T01:00:00.000Z" },
    ])

    expect(result).toMatchObject({ deleted: 1, deletedFiles: 0 })
    expect(result.deletedUntil).toBeTruthy()
    expect(await storedCollectionNames()).toEqual(["Keep", "Delete me"])
    const { listImageCollections, restoreImageCollections } =
      await import("./image-collections")
    expect((await listImageCollections()).map((item) => item.name)).toEqual([
      "Keep",
    ])
    await expect(readAssetBytes(filePath("delete-me.jpg"))).resolves.toBeTruthy()
    await restoreImageCollections([
      { name: "Delete me", created_at: "2026-07-03T01:00:00.000Z" },
    ])
    expect((await listImageCollections()).map((item) => item.name)).toEqual([
      "Keep",
      "Delete me",
    ])
  })
})

describe("upsertImageCollection", () => {
  it("deletes files removed from an existing collection record", async () => {
    await seedCollections([
      {
        name: "Edit me",
        created_at: "2026-07-03T02:00:00.000Z",
        images: [
          {
            image_link:
              "/api/local-assets/image-collections/files/remove-this.jpg",
            caption: "Remove",
          },
          {
            image_link:
              "/api/local-assets/image-collections/files/keep-this.jpg",
            caption: "Keep",
          },
        ],
      },
    ])
    await seedFile("remove-this.jpg")
    await seedFile("keep-this.jpg")

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

    await expect(readAssetBytes(filePath("remove-this.jpg"))).rejects.toThrow()
    await expect(readAssetBytes(filePath("keep-this.jpg"))).resolves.toBeTruthy()
  })

  it("backfills hashes for collection files on upsert", async () => {
    await seedFile("hash-me.jpg")

    const { upsertImageCollection } = await import("./image-collections")
    await upsertImageCollection({
      name: "Hash me",
      created_at: "2026-07-03T02:00:00.000Z",
      images: [
        {
          image_link: "/api/local-assets/image-collections/files/hash-me.jpg",
          caption: "Hash local file",
        },
      ],
    })

    const [collection] = await readJsonArrayStore<{
      images: { hash?: string }[]
    }>({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
    })
    expect(collection.images[0].hash).toBe(
      createHash("sha256").update(Buffer.from([1, 2, 3])).digest("hex")
    )
  })
})
