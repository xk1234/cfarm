import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-json-store-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("json array store", () => {
  it("reads missing and malformed stores as empty arrays", async () => {
    expect(await readJsonArrayStore({ rootDir, fileName: "items.json", key: "items" })).toEqual([])

    await writeFile(path.join(rootDir, "items.json"), "{bad json")

    expect(await readJsonArrayStore({ rootDir, fileName: "items.json", key: "items" })).toEqual([])
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
})
