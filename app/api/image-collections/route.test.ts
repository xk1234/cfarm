import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clearTestTables } from "@/lib/test-helpers"
import { writeJsonArrayStore } from "@/lib/json-store"

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
