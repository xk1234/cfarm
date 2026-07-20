import { rm } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/image-collections.json -> image_collections; downloaded media -> Storage.
let tempRoot: string

async function clearCollections() {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured for tests.")
  for (;;) {
    const res = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "permanent_assets",
      [Query.equal("source_key", ["image_collection"]), Query.limit(100)]
    )
    for (const row of res.rows) {
      await aw.tables.deleteRow(
        APPWRITE_DATABASE_ID,
        "permanent_assets",
        String(row.$id)
      )
    }
    if (res.rows.length < 100) break
  }
}

beforeEach(async () => {
  await clearCollections()
  tempRoot = path.join(
    os.tmpdir(),
    `cfarm-image-import-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearCollections)

async function storedCollections() {
  return readJsonArrayStore<{
    name: string
    created_at: string
    images: { image_link: string; caption: string; hash?: string }[]
  }>({
    rootDir: path.join(tempRoot, "data"),
    fileName: "image-collections.json",
    key: "collections",
  })
}

describe("importRemoteImagesToCollection", () => {
  it("prepends a collection without replacing a large legacy catalog", async () => {
    const legacyCollections = Array.from({ length: 41 }, (_, index) => ({
      name: `Legacy collection ${index + 1}`,
      created_at: `2026-07-03T02:${String(index).padStart(2, "0")}:00.000Z`,
      images: [],
    }))
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
      records: legacyCollections,
    })

    const { upsertImageCollection } = await import("./image-collections")
    await upsertImageCollection({
      name: "Astrology — Mystical & Celestial",
      created_at: "2026-07-17T04:30:00.000Z",
      images: [],
    })

    const stored = await storedCollections()
    expect(stored).toHaveLength(42)
    expect(stored[0].name).toBe("Astrology — Mystical & Celestial")
    expect(stored.slice(1).map((collection) => collection.name)).toEqual(
      legacyCollections.map((collection) => collection.name)
    )
  })

  it("downloads remote images into Storage and saves collection records", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/jpeg" },
      })
    )
    const { importRemoteImagesToCollection } =
      await import("./image-collections")

    const result = await importRemoteImagesToCollection({
      collectionName: "Tumblr captures",
      images: [
        {
          url: "https://64.media.tumblr.com/image-a.jpg",
          caption: "Look one",
          sourceUrl: "https://www.tumblr.com/post",
        },
        {
          url: "https://64.media.tumblr.com/image-a.jpg",
          caption: "Duplicate",
          sourceUrl: "https://www.tumblr.com/post",
        },
        { url: "not-a-url" },
      ],
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.imported).toBe(1)
    expect(result.collection.name).toBe("Tumblr captures")
    expect(result.collection.images).toHaveLength(1)
    expect(result.collection.images[0].caption).toBe("Look one")
    expect(result.collection.images[0].image_link).toMatch(
      /^\/api\/local-assets\/image-collections\/files\/.+\.jpg$/
    )
    expect(result.collection.images[0].hash).toBe(
      createHash("sha256")
        .update(Buffer.from([1, 2, 3]))
        .digest("hex")
    )

    const stored = await storedCollections()
    expect(stored[0].images[0].image_link).toBe(
      result.collection.images[0].image_link
    )
    expect(stored[0].images[0].hash).toBe(result.collection.images[0].hash)

    const fileName = decodeURIComponent(
      result.collection.images[0].image_link.split("/").at(-1) ?? ""
    )
    await deleteAssetFromAppwrite(
      path.join(tempRoot, "data", "image-collections", "files", fileName)
    )
  })

  it("updates an existing collection with the same name instead of duplicating", async () => {
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
      records: [
        {
          name: "Pinterest - nature texture",
          created_at: "2026-07-03T02:40:48.955Z",
          images: [
            {
              image_link:
                "/api/local-assets/image-collections/files/existing.jpg",
              caption: "Existing",
            },
          ],
        },
      ],
    })
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/jpeg" },
      })
    )
    const { importRemoteImagesToCollection } =
      await import("./image-collections")

    const result = await importRemoteImagesToCollection({
      collectionName: "Pinterest - nature texture",
      collectionCreatedAt: "2026-07-03T02:45:58.426Z",
      images: [{ url: "https://images.example.com/new.jpg", caption: "New" }],
      fetchImpl,
    })

    const stored = await storedCollections()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      name: "Pinterest - nature texture",
      created_at: "2026-07-03T02:40:48.955Z",
    })
    expect(stored[0].images.map((image) => image.caption)).toEqual([
      "New",
      "Existing",
    ])

    const fileName = decodeURIComponent(
      result.collection.images[0].image_link.split("/").at(-1) ?? ""
    )
    await deleteAssetFromAppwrite(
      path.join(tempRoot, "data", "image-collections", "files", fileName)
    )
  })
})
