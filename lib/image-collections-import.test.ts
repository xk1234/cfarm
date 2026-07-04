import { mkdir, readFile, rm, stat } from "node:fs/promises"
import { writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `cfarm-image-import-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(tempRoot, { recursive: true })
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("importRemoteImagesToCollection", () => {
  it("downloads remote images into local collection storage and saves collection records", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/jpeg" },
    }))
    const { importRemoteImagesToCollection } = await import("./image-collections")

    const result = await importRemoteImagesToCollection({
      collectionName: "Tumblr captures",
      images: [
        { url: "https://64.media.tumblr.com/image-a.jpg", caption: "Look one", sourceUrl: "https://www.tumblr.com/post" },
        { url: "https://64.media.tumblr.com/image-a.jpg", caption: "Duplicate", sourceUrl: "https://www.tumblr.com/post" },
        { url: "not-a-url" },
      ],
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.imported).toBe(1)
    expect(result.collection.name).toBe("Tumblr captures")
    expect(result.collection.images).toHaveLength(1)
    expect(result.collection.images[0].caption).toBe("Look one")
    expect(result.collection.images[0].image_link).toMatch(/^\/api\/local-assets\/image-collections\/files\/.+\.jpg$/)

    const stored = JSON.parse(await readFile(path.join(tempRoot, "data", "image-collections.json"), "utf8"))
    expect(stored.collections[0].images[0].image_link).toBe(result.collection.images[0].image_link)

    const fileName = decodeURIComponent(result.collection.images[0].image_link.split("/").at(-1) ?? "")
    await expect(stat(path.join(tempRoot, "data", "image-collections", "files", fileName))).resolves.toMatchObject({ size: 3 })
  })

  it("updates an existing collection with the same name instead of creating duplicate names", async () => {
    await mkdir(path.join(tempRoot, "data"), { recursive: true })
    await writeFile(path.join(tempRoot, "data", "image-collections.json"), `${JSON.stringify({
      collections: [
        {
          name: "Pinterest - nature texture",
          created_at: "2026-07-03T02:40:48.955Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/existing.jpg",
              caption: "Existing",
            },
          ],
        },
      ],
    }, null, 2)}\n`)
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/jpeg" },
    }))
    const { importRemoteImagesToCollection } = await import("./image-collections")

    await importRemoteImagesToCollection({
      collectionName: "Pinterest - nature texture",
      collectionCreatedAt: "2026-07-03T02:45:58.426Z",
      images: [{ url: "https://images.example.com/new.jpg", caption: "New" }],
      fetchImpl,
    })

    const stored = JSON.parse(await readFile(path.join(tempRoot, "data", "image-collections.json"), "utf8"))
    expect(stored.collections).toHaveLength(1)
    expect(stored.collections[0]).toMatchObject({
      name: "Pinterest - nature texture",
      created_at: "2026-07-03T02:40:48.955Z",
    })
    expect(stored.collections[0].images.map((image: { caption: string }) => image.caption)).toEqual(["New", "Existing"])
  })
})
