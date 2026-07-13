import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only: `data/characters/images.json` -> `character_generations`, run
// against cfarm (forced by vitest.setup.ts). Media lives in Storage, so
// deletion is asserted via the response payload + remaining records.
const rootDir = path.join(process.cwd(), "data", "characters")
const TABLE = "character_generations"

const clearGenerations = () => clearTestTables(TABLE)

beforeEach(clearGenerations)
afterAll(clearGenerations)

describe("DELETE /api/characters/images", () => {
  it("deletes a generation record and reports its unused media file", async () => {
    await writeJsonArrayStore({
      rootDir,
      fileName: "images.json",
      key: "generations",
      records: [
        {
          id: "delete-me",
          characterId: "1",
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
    })

    const { DELETE } = await import("./[id]/route")
    const response = await DELETE(
      new Request("http://localhost/api/characters/images/delete-me", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "delete-me" }) }
    )
    const payload = await response.json()

    const remaining = await readJsonArrayStore({
      rootDir,
      fileName: "images.json",
      key: "generations",
    })
    expect(response.status).toBe(200)
    expect(payload).toEqual({ deleted: true, deletedFiles: 1 })
    expect(remaining).toEqual([])
  })
})
