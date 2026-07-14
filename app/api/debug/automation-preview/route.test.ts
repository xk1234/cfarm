import { mkdtemp, rm } from "node:fs/promises"
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
import { clearTestTables } from "@/lib/test-helpers"
import {
  createLocalAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts). The preview
// route is read-only, so automation_runs/results must stay empty afterward.
let tempRoot: string

const clearAll = () =>
  clearTestTables(
    "automations",
    "image_collections",
    "automation_runs",
    "results"
  )

beforeEach(async () => {
  await clearAll()
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-debug-preview-"))
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  // Preview builds its plan from the edited JSON; keep it off the live LLM.
  vi.stubEnv("OPENROUTER_API_KEY", "")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearAll)

describe("POST /api/debug/automation-preview", () => {
  it("generates a read-only slide plan from edited automation JSON", async () => {
    const automation = createLocalAutomationRecord({
      name: "Debug preview",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-debug-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-debug-scenes-2026-07-03t00-00-00-000z",
    }
    automation.schema.formatting = automation.schema.formatting.map(
      (section) =>
        section.id === "hook"
          ? {
              ...section,
              aspect_ratio: "4:5",
              textItems: [
                {
                  ...section.textItems[0],
                  contentDirection: "edited json hook",
                },
              ],
            }
          : section.id === "body" || section.id === "cta"
            ? { ...section, aspect_ratio: "4:5", slideCount: 0 }
            : section
    )
    await upsertAutomationRecords({
      rootDir: path.join(tempRoot, "data", "automations"),
      records: [automation],
    })
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "image-collections.json",
      key: "collections",
      records: [
        {
          name: "Debug scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            {
              image_link: "/api/local-assets/image-collections/files/debug.jpg",
              caption: "Debug image",
            },
          ],
        },
      ],
    })

    const editedAutomation = {
      ...automation,
      schema: {
        ...automation.schema,
        title: "Edited preview title",
      },
    }
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/debug/automation-preview", {
        method: "POST",
        body: JSON.stringify({
          automation: editedAutomation,
          now: "2026-07-03T15:05:00.000Z",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      automationId: automation.id,
      automationTitle: "Edited preview title",
      status: "succeeded",
      plan: {
        title: "Edited preview title",
        hook: "edited json hook",
        slides: expect.arrayContaining([
          expect.objectContaining({
            aspectRatio: "4:5",
            text: "edited json hook",
            imageUrl: "/api/local-assets/image-collections/files/debug.jpg",
          }),
        ]),
      },
    })
    // Preview is read-only: no run or result rows should have been written.
    expect(
      await readJsonArrayStore({
        rootDir: path.join(tempRoot, "data", "automations"),
        fileName: "runs.json",
        key: "runs",
      })
    ).toEqual([])
    expect(
      await readJsonArrayStore({
        rootDir: path.join(tempRoot, "data", "results"),
        fileName: "results.json",
        key: "results",
      })
    ).toEqual([])
  })

  it("rejects JSON without an automation schema", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/debug/automation-preview", {
        method: "POST",
        body: JSON.stringify({ name: "Missing schema" }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Automation JSON must include a schema object")
  })
})
