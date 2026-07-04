import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createLocalAutomationRecord, upsertAutomationRecords } from "@/lib/automations"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-automation-run-route-"))
  await mkdir(path.join(tempRoot, "data", "automations"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/automations/run", () => {
  it("runs due automations through the local runner", async () => {
    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        tiktok_account_id: "tiktok-1",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: path.join(tempRoot, "data", "automations"),
      records: [automation],
    })
    await writeFile(path.join(tempRoot, "data", "image-collections.json"), `${JSON.stringify({
      collections: [
        {
          name: "Daily scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            { image_link: "/api/local-assets/image-collections/files/daily-scene.jpg", caption: "Daily scene" },
          ],
        },
      ],
    }, null, 2)}\n`)

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/automations/run", {
      method: "POST",
      body: JSON.stringify({ now: "2026-07-03T15:05:00.000Z" }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.created).toHaveLength(1)
    expect(payload.created[0]).toMatchObject({
      automationId: automation.id,
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "scheduled",
    })
    expect(payload.created[0].slideshowId).toEqual(expect.stringContaining("slideshow-"))

    const slideshows = JSON.parse(await readFile(path.join(tempRoot, "data", "slideshows", "slideshows.json"), "utf8"))
    expect(slideshows.slideshows[0]).toMatchObject({
      id: payload.created[0].slideshowId,
      title: "Daily hooks",
      status: "draft",
      slideshow_type: "automation",
    })
    expect(slideshows.slideshows[0].images[0]).toMatchObject({
      image_url: "/api/local-assets/image-collections/files/daily-scene.jpg",
      textItems: [
        {
          textPosition: { y: 16 },
        },
      ],
    })
  })
})

describe("GET /api/automations/run", () => {
  it("requires the cron secret when configured", async () => {
    vi.stubEnv("CRON_SECRET", "secret-1")

    const { GET } = await import("./route")
    const response = await GET(new Request("http://localhost/api/automations/run"))

    expect(response.status).toBe(401)
  })
})

describe("GET /api/automations/runs", () => {
  it("returns persisted recent runs for an automation", async () => {
    const automation = createLocalAutomationRecord({
      name: "Recent hooks",
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/New_York",
          posting_times: [{ time: "11:00 AM", days: ["Fri"] }],
        },
      },
    })
    await upsertAutomationRecords({
      rootDir: path.join(tempRoot, "data", "automations"),
      records: [automation],
    })
    await writeFile(path.join(tempRoot, "data", "image-collections.json"), `${JSON.stringify({
      collections: [
        {
          name: "Recent scenes",
          created_at: "2026-07-03T00:00:00.000Z",
          images: [
            { image_link: "/api/local-assets/image-collections/files/recent-scene.jpg", caption: "Recent scene" },
          ],
        },
      ],
    }, null, 2)}\n`)

    const runRoute = await import("./route")
    await runRoute.POST(new Request("http://localhost/api/automations/run", {
      method: "POST",
      body: JSON.stringify({
        automationId: automation.id,
        force: true,
        now: "2026-07-03T15:05:00.000Z",
      }),
    }))

    const runsRoute = await import("../runs/route")
    const response = await runsRoute.GET(new Request(`http://localhost/api/automations/runs?automationId=${automation.id}`))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.runs).toHaveLength(1)
    expect(payload.runs[0]).toMatchObject({
      automationId: automation.id,
      automationTitle: "Recent hooks",
      status: "scheduled",
    })
  })
})
