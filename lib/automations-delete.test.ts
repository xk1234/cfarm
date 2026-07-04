import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { deleteAutomationRecord } from "./automations"
import { defaultAutomationSchema } from "./realfarm-automation"

let rootDir: string

beforeEach(async () => {
  rootDir = path.join(os.tmpdir(), `cfarm-automation-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(rootDir, { recursive: true })
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("deleteAutomationRecord", () => {
  it("removes the selected automation record from the automation db", async () => {
    await writeFile(path.join(rootDir, "automations.json"), `${JSON.stringify({
      automations: [
        automationRecord("delete-me"),
        automationRecord("keep-me"),
      ],
    }, null, 2)}\n`)

    const result = await deleteAutomationRecord({ rootDir, id: "delete-me" })

    const stored = JSON.parse(await readFile(path.join(rootDir, "automations.json"), "utf8"))
    expect(result?.id).toBe("delete-me")
    expect(stored.automations.map((record: { id: string }) => record.id)).toEqual(["keep-me"])
  })
})

function automationRecord(id: string) {
  const summary = {
    id,
    name: id,
    status: "Draft",
    account: "No TikTok account",
    handle: "Click to add account",
    times: [],
    favorite: false,
    theme: "ugc",
  }

  return {
    id,
    name: id,
    status: "draft",
    account: summary.account,
    handle: summary.handle,
    times: [],
    favorite: false,
    theme: "ugc",
    updatedAt: "2026-07-03T00:00:00.000Z",
    schema: defaultAutomationSchema(summary),
  }
}
