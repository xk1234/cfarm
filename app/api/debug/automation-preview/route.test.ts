import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createLocalAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-debug-preview-"))
  await mkdir(path.join(tempRoot, "data", "automations"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

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
      aspect_ratio: "9:16",
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
    await writeFile(
      path.join(tempRoot, "data", "image-collections.json"),
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Debug scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/debug.jpg",
                  caption: "Debug image",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )

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
    await expect(
      readFile(path.join(tempRoot, "data", "automations", "runs.json"), "utf8")
    ).rejects.toThrow()
    await expect(
      readFile(path.join(tempRoot, "data", "results", "results.json"), "utf8")
    ).rejects.toThrow()
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
