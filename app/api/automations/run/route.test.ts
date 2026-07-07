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
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-automation-run-route-")
  )
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
  it("fails closed when the cron secret is not configured", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/run", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-1",
        },
        body: JSON.stringify({ force: true }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe("CRON_SECRET is not configured")
  })

  it("requires the cron secret bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "secret-1")

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/run", {
        method: "POST",
        body: JSON.stringify({
          force: true,
          schema: { social_integrations: [] },
        }),
      })
    )

    expect(response.status).toBe(401)
  })

  it("runs due automations through the local runner", async () => {
    vi.stubEnv("CRON_SECRET", "secret-1")

    const automation = createLocalAutomationRecord({
      name: "Daily hooks",
      overrides: {
        status: "live",
        social_integrations: [
          {
            provider: "tiktok",
            integration_id: "tiktok-1",
            name: "Brand TikTok",
            profile: "brand",
          },
        ],
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
    await writeFile(
      path.join(tempRoot, "data", "image-collections.json"),
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Daily scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/daily-scene.jpg",
                  caption: "Daily scene",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )
    await mkdir(path.join(tempRoot, "data", "image-collections", "files"), {
      recursive: true,
    })
    await writeFile(
      path.join(
        tempRoot,
        "data",
        "image-collections",
        "files",
        "daily-scene.jpg"
      ),
      "daily scene image"
    )

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/run", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-1",
        },
        body: JSON.stringify({ now: "2026-07-03T15:05:00.000Z" }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.created).toHaveLength(1)
    expect(payload.created[0]).toMatchObject({
      automationId: automation.id,
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "succeeded",
      socialStatuses: [
        {
          provider: "tiktok",
          integrationId: "tiktok-1",
          name: "Brand TikTok",
          profile: "brand",
          status: "queued",
        },
      ],
    })
    expect(payload.created[0].slideshowId).toEqual(
      expect.stringContaining("slideshow-")
    )
    expect(payload.results[0]).toMatchObject({
      automationId: automation.id,
      runId: payload.created[0].id,
      workflowType: "slideshow",
      artifacts: {
        slideshowId: payload.created[0].slideshowId,
      },
    })
    const results = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "results", "results.json"),
        "utf8"
      )
    )
    expect(results.results).toHaveLength(1)
    expect(results.results[0]).toMatchObject({
      id: `result-${payload.created[0].id}`,
      automationId: automation.id,
      runId: payload.created[0].id,
      workflowType: "slideshow",
      artifacts: {
        slideshowId: payload.created[0].slideshowId,
      },
      payload: {
        type: "slideshow",
        slideshowType: "automation",
      },
    })

    expect(results.results[0].payload).toMatchObject({
      type: "slideshow",
      slideshowType: "automation",
    })
    expect(results.results[0].payload.slides[0]).toMatchObject({
      image_url: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/slide-001\.png$/
      ),
      source_image_url: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/source-001\.jpg$/
      ),
      textItems: [
        {
          textPosition: {
            x: expect.any(Number),
            y: expect.any(Number),
          },
        },
      ],
    })
  })
})

describe("GET /api/automations/run", () => {
  it("fails closed when the cron secret is not configured", async () => {
    const { GET } = await import("./route")
    const response = await GET(
      new Request("http://localhost/api/automations/run", {
        headers: {
          authorization: "Bearer secret-1",
        },
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe("CRON_SECRET is not configured")
  })

  it("requires the cron secret when configured", async () => {
    vi.stubEnv("CRON_SECRET", "secret-1")

    const { GET } = await import("./route")
    const response = await GET(
      new Request("http://localhost/api/automations/run")
    )

    expect(response.status).toBe(401)
  })
})

describe("GET /api/automations/runs", () => {
  it("returns persisted recent runs for an automation", async () => {
    vi.stubEnv("CRON_SECRET", "secret-1")

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
    await writeFile(
      path.join(tempRoot, "data", "image-collections.json"),
      `${JSON.stringify(
        {
          collections: [
            {
              name: "Recent scenes",
              created_at: "2026-07-03T00:00:00.000Z",
              images: [
                {
                  image_link:
                    "/api/local-assets/image-collections/files/recent-scene.jpg",
                  caption: "Recent scene",
                },
              ],
            },
          ],
        },
        null,
        2
      )}\n`
    )
    await mkdir(path.join(tempRoot, "data", "image-collections", "files"), {
      recursive: true,
    })
    await writeFile(
      path.join(
        tempRoot,
        "data",
        "image-collections",
        "files",
        "recent-scene.jpg"
      ),
      "recent scene image"
    )

    const runRoute = await import("./route")
    const createResponse = await runRoute.POST(
      new Request("http://localhost/api/automations/run", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-1",
        },
        body: JSON.stringify({
          automationId: automation.id,
          force: true,
          now: "2026-07-03T15:05:00.000Z",
        }),
      })
    )
    const createPayload = await createResponse.json()

    const runsRoute = await import("../runs/route")
    const response = await runsRoute.GET(
      new Request(
        `http://localhost/api/automations/runs?automationId=${automation.id}`
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.runs).toHaveLength(1)
    expect(payload.runs[0]).toMatchObject({
      automationId: automation.id,
      automationTitle: "Recent hooks",
      status: "succeeded",
    })
    expect(createPayload.created[0].renderedSlides[0]).toMatchObject({
      imageUrl: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/slide-001\.png$/
      ),
      sourceImageUrl: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/source-001\.jpg$/
      ),
    })
    expect(payload.runs[0].renderedSlides[0]).toMatchObject({
      imageUrl: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/slide-001\.png$/
      ),
      sourceImageUrl: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/source-001\.jpg$/
      ),
      aspectRatio: expect.any(String),
    })
    expect(payload.runs[0].renderedSlides[0].imageUrl).not.toContain(
      "/image-collections/files/"
    )
  })
})
