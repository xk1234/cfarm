import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import {
  deleteAssetFromAppwrite,
  mirrorAssetToAppwrite,
  readAssetBytes,
} from "@/lib/asset-storage"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/image-collections.json -> image_collections; media -> Storage.
let tempRoot: string


const clearAll = () => clearTestTables("image_collections", "usage_ledger")

beforeEach(async () => {
  await clearAll()
  tempRoot = path.join(
    os.tmpdir(),
    `cfarm-image-route-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearAll)

describe("DELETE /api/image-collections", () => {
  it("soft deletes selected collections, retains files, and restores them", async () => {
    await mirrorAssetToAppwrite(
      path.join(
        tempRoot,
        "data",
        "image-collections",
        "files",
        "collection-image.jpg"
      ),
      new Uint8Array([1, 2, 3])
    )
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
      records: [
        {
          name: "Delete me",
          created_at: "2026-07-03T01:00:00.000Z",
          images: [
            {
              image_link:
                "/api/local-assets/image-collections/files/collection-image.jpg",
              caption: "",
            },
          ],
        },
      ],
    })

    const { DELETE, GET, POST } = await import("./route")
    const response = await DELETE(
      new Request("http://localhost/api/image-collections", {
        method: "DELETE",
        body: JSON.stringify({
          collections: [
            { name: "Delete me", created_at: "2026-07-03T01:00:00.000Z" },
          ],
        }),
      })
    )
    const payload = await response.json()
    const stored = await readJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
    })

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ deleted: 1, deletedFiles: 0 })
    expect(stored).toEqual([
      expect.objectContaining({
        name: "Delete me",
        deletedAt: expect.any(String),
        deletedUntil: expect.any(String),
      }),
    ])
    await expect((await GET()).json()).resolves.toMatchObject({ collections: [] })
    await expect(
      readAssetBytes(
        path.join(
          tempRoot,
          "data",
          "image-collections",
          "files",
          "collection-image.jpg"
        )
      )
    ).resolves.toBeTruthy()

    const restoreResponse = await POST(
      new Request("http://localhost/api/image-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          collections: [
            { name: "Delete me", created_at: "2026-07-03T01:00:00.000Z" },
          ],
        }),
      })
    )
    expect(restoreResponse.status).toBe(200)
    expect(await restoreResponse.json()).toEqual({ restored: 1 })
    expect((await (await GET()).json()).collections).toHaveLength(1)

    await deleteAssetFromAppwrite(
      path.join(
        tempRoot,
        "data",
        "image-collections",
        "files",
        "collection-image.jpg"
      )
    )
  })
})

describe("GET /api/image-collections", () => {
  it("includes per-image last-used dates from the usage ledger", async () => {
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
      records: [
        {
          name: "Used images",
          created_at: "2026-07-03T01:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/used.jpg",
              caption: "Used",
              hash: "hash-used",
            },
          ],
        },
      ],
    })
    const { appendUsageRecords } = await import("@/lib/usage-ledger")
    await appendUsageRecords({
      rootDir: path.join(tempRoot, "data"),
      records: [
        {
          automation_id: "automation-a",
          kind: "image",
          key: "hash-used",
          run_id: "run-used",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
      now: new Date("2026-07-07T10:00:00.000Z"),
    })

    const { GET } = await import("./route")
    const response = await GET()
    const payload = await response.json()

    expect(payload.collections[0].images[0]).toMatchObject({
      image_link: "/api/local-assets/image-collections/files/used.jpg",
      hash: "hash-used",
      last_used_at: "2026-07-07T10:00:00.000Z",
    })
  })
})
