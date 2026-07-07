import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  readJsonArrayStore,
  withJsonArrayStore,
  writeJsonArrayStore,
} from "@/lib/json-store"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-json-store-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("json array store", () => {
  it("reads missing stores as empty arrays", async () => {
    expect(
      await readJsonArrayStore({
        rootDir,
        fileName: "items.json",
        key: "items",
      })
    ).toEqual([])
  })

  it("throws a descriptive error for corrupt JSON stores", async () => {
    await writeFile(path.join(rootDir, "items.json"), "{bad json")

    await expect(
      readJsonArrayStore({ rootDir, fileName: "items.json", key: "items" })
    ).rejects.toThrow(/Failed to parse JSON store/)
  })

  it("writes keyed arrays with stable pretty JSON", async () => {
    await writeJsonArrayStore({
      rootDir,
      fileName: "items.json",
      key: "items",
      records: [{ id: "a" }],
    })

    expect(await readFile(path.join(rootDir, "items.json"), "utf8")).toBe(`{
  "items": [
    {
      "id": "a"
    }
  ]
}
`)
  })

  it("serializes concurrent updates for the same store", async () => {
    await Promise.all(
      Array.from({ length: 10 }, async (_, index) =>
        withJsonArrayStore<{ id: string }, void>({
          rootDir,
          fileName: "items.json",
          key: "items",
          async update(records) {
            await new Promise((resolve) => setTimeout(resolve, 1))
            return {
              records: [...records, { id: `item-${index}` }],
            }
          },
        })
      )
    )

    const records = await readJsonArrayStore<{ id: string }>({
      rootDir,
      fileName: "items.json",
      key: "items",
    })
    expect(records).toHaveLength(10)
    expect(new Set(records.map((record) => record.id)).size).toBe(10)
  })
})
