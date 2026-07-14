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
import { mirrorAssetToAppwrite } from "@/lib/asset-storage"
import {
  createLocalAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import { createGeneratedVideoExport } from "@/lib/generated-videos"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts).
// Slides rasterize to PNG only where a rasterizer exists (darwin), else SVG.
const slideExt = process.platform === "darwin" ? "png" : "svg"
let tempRoot: string

const clearAll = () =>
  clearTestTables(
    "automations",
    "automation_runs",
    "generated_video_exports",
    "image_collections",
    "slideshows",
    "results"
  )

beforeEach(async () => {
  await clearAll()
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-automation-run-route-")
  )
  vi.resetModules()
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
  // Deterministic LLM: the runner reads media via Appwrite (undici), so the
  // only global-fetch caller is OpenRouter for hook/caption generation.
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key")
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Generated Hook Run",
                    caption: "A relatable hook caption.",
                    hashtags: "#hooks #content #growth",
                    text: { "content-2__text-0": "generated body text" },
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
    )
  )
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.doUnmock("@/lib/automation-runner")
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearAll)

describe("POST /api/automations/run", () => {
  it("runs browser requests without additional API credentials", async () => {
    const runDueAutomations = vi.fn(
      async (_input: Record<string, unknown>) => ({
        created: [],
        results: [],
        skipped: [],
      })
    )
    vi.doMock("@/lib/automation-runner", () => ({
      runDueAutomations,
    }))

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/run", {
        method: "POST",
        body: JSON.stringify({
          now: "2026-07-03T15:05:00.000Z",
          automationId: "automation-1",
          schema: { title: "stale client schema" },
          force: true,
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.created).toEqual([])
    expect(runDueAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "automation-1",
        force: true,
      })
    )
    expect(runDueAutomations.mock.calls[0]?.[0]).not.toHaveProperty(
      "schemaOverride"
    )
  })

  it("runs due automations through the local runner", async () => {
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
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-daily-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-daily-scenes-2026-07-03t00-00-00-000z",
    }
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
    })
    await mirrorAssetToAppwrite(
      path.join(
        tempRoot,
        "data",
        "image-collections",
        "files",
        "daily-scene.jpg"
      ),
      new TextEncoder().encode("daily scene image")
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
    const resultsRows = await readJsonArrayStore<Record<string, any>>({
      rootDir: path.join(tempRoot, "data", "results"),
      fileName: "results.json",
      key: "results",
    })
    expect(resultsRows).toHaveLength(1)
    expect(resultsRows[0]).toMatchObject({
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

    expect(resultsRows[0].payload).toMatchObject({
      type: "slideshow",
      slideshowType: "automation",
    })
    expect(resultsRows[0].payload.slides[0]).toMatchObject({
      image_url: expect.stringMatching(
        new RegExp(
          `^/api/local-assets/slideshows/outputs/slideshow-.+/slide-001\\.${slideExt}$`
        )
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

describe("GET /api/automations/runs", () => {
  it("includes generated video exports linked to an automation", async () => {
    const automationId = "video-automation-1"
    const videoExport = await createGeneratedVideoExport({
      rootDir: path.join(tempRoot, "data", "generated-videos"),
      type: "template_video",
      status: "ready",
      title: "Three ways to improve your hook",
      description: "A generated video description",
      hashtags: ["#hooks", "#video"],
      sourceConfig: {
        automationId,
        automationName: "Daily video hooks",
        hook: "Stop scrolling",
      },
      previewUrl: "/generated/preview.jpg",
      videoUrl: "/generated/video.mp4",
    })

    const runsRoute = await import("../runs/route")
    const response = await runsRoute.GET(
      new Request(
        `http://localhost/api/automations/runs?automationId=${automationId}`
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.runs).toHaveLength(1)
    expect(payload.runs[0]).toMatchObject({
      id: videoExport.id,
      automationId,
      automationTitle: "Daily video hooks",
      status: "succeeded",
      videoUrl: "/generated/video.mp4",
      thumbnailUrl: "/generated/preview.jpg",
      plan: {
        title: "Three ways to improve your hook",
        caption: "A generated video description",
        hashtags: "#hooks #video",
        publishType: "video",
      },
    })
  })

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
    automation.schema.image_collection_ids = {
      ...automation.schema.image_collection_ids,
      first_slide: {
        collection: "collection-recent-scenes-2026-07-03t00-00-00-000z",
        mode: "collection",
        single_image: null,
      },
      all_slides: "collection-recent-scenes-2026-07-03t00-00-00-000z",
    }
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
    })
    await mirrorAssetToAppwrite(
      path.join(
        tempRoot,
        "data",
        "image-collections",
        "files",
        "recent-scene.jpg"
      ),
      new TextEncoder().encode("recent scene image")
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
        new RegExp(
          `^/api/local-assets/slideshows/outputs/slideshow-.+/slide-001\\.${slideExt}$`
        )
      ),
      sourceImageUrl: expect.stringMatching(
        /^\/api\/local-assets\/slideshows\/outputs\/slideshow-.+\/source-001\.jpg$/
      ),
    })
    expect(payload.runs[0].renderedSlides[0]).toMatchObject({
      imageUrl: expect.stringMatching(
        new RegExp(
          `^/api/local-assets/slideshows/outputs/slideshow-.+/slide-001\\.${slideExt}$`
        )
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
