import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import { createResultRecord } from "@/lib/results"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts). The real
// cwd's data-relative paths map to the same tables the routes + seeds use.
const tempRoot = process.cwd()


const clearAll = () => clearTestTables("automations", "results", "automation_runs", "postfast_posts")

beforeEach(clearAll)

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

afterAll(clearAll)

describe("/api/automations", () => {
  it("deletes generated slideshows when deleting their automation", async () => {
    const automationsRoute = await import("./route")
    const slideshowsRoute = await import("../slideshows/route")

    const createAutomationResponse = await automationsRoute.POST(
      new Request("http://localhost/api/automations", {
        method: "POST",
        body: JSON.stringify({ name: "Cascade automation" }),
      })
    )
    const createAutomationPayload = await createAutomationResponse.json()
    const automationId = createAutomationPayload.automation.id

    await slideshowsRoute.POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          automationId,
          title: "Generated one",
          slideshow_type: "automation",
        }),
      })
    )
    const legacySlideshowResponse = await slideshowsRoute.POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          title: "Legacy generated",
          slideshow_type: "automation",
        }),
      })
    )
    const legacySlideshowPayload = await legacySlideshowResponse.json()
    await slideshowsRoute.POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          automationId,
          title: "Generated two",
          slideshow_type: "automation",
        }),
      })
    )
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data", "automations"),
      fileName: "runs.json",
      key: "runs",
      records: [
        {
          id: "automation-run-legacy",
          automationId,
          automationTitle: "Cascade automation",
          scheduledFor: "2026-07-04T12:00:00.000Z",
          status: "succeeded",
          slideshowId: legacySlideshowPayload.slideshow.id,
          plan: {
            title: "Cascade automation",
            hook: "Legacy hook",
            imageCollectionIds: [],
            slides: [],
            slideCount: { mode: "static", count: 1 },
            publishType: "slideshow",
            autoMusic: true,
            autoPost: false,
            language: "English",
          },
          createdAt: "2026-07-04T12:00:00.000Z",
          updatedAt: "2026-07-04T12:00:00.000Z",
        },
      ],
    })
    await slideshowsRoute.POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          automationId: "automation-keep",
          title: "Keep",
          slideshow_type: "automation",
        }),
      })
    )

    const automationsIdRoute = await import("./[id]/route")
    const deleteResponse = await automationsIdRoute.DELETE(
      new Request(`http://localhost/api/automations/${automationId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: automationId }) }
    )
    const deletePayload = await deleteResponse.json()
    const listResponse = await slideshowsRoute.GET(
      new Request("http://localhost/api/slideshows")
    )
    const listPayload = await listResponse.json()

    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.deletedSlideshowsCount).toBe(3)
    expect(listPayload.slideshows).toHaveLength(1)
    expect(listPayload.slideshows[0]).toMatchObject({
      automationId: "automation-keep",
      title: "Keep",
    })
  })

  it("deletes automation runs and scheduler records when deleting an automation", async () => {
    const automationsRoute = await import("./route")
    const slideshowsRoute = await import("../slideshows/route")

    const createAutomationResponse = await automationsRoute.POST(
      new Request("http://localhost/api/automations", {
        method: "POST",
        body: JSON.stringify({ name: "Cascade scheduler automation" }),
      })
    )
    const createAutomationPayload = await createAutomationResponse.json()
    const automationId = createAutomationPayload.automation.id

    const createSlideshowResponse = await slideshowsRoute.POST(
      new Request("http://localhost/api/slideshows", {
        method: "POST",
        body: JSON.stringify({
          automationId,
          title: "Scheduled generated slideshow",
          slideshow_type: "automation",
        }),
      })
    )
    const createSlideshowPayload = await createSlideshowResponse.json()
    const slideshowId = createSlideshowPayload.slideshow.id
    await createResultRecord({
      automationId,
      runId: "delete-run",
      workflowType: "slideshow",
      title: "Scheduled generated slideshow",
      status: "succeeded",
      artifacts: {
        slideshowId,
        outputImages: [],
      },
    })

    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data", "automations"),
      fileName: "runs.json",
      key: "runs",
      records: [
        automationRun("delete-run", automationId, slideshowId),
        automationRun("keep-run", "automation-keep", "slideshow-keep"),
      ],
    })
    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data"),
      fileName: "postfast-posts.json",
      key: "posts",
      records: [
        postfastPost("delete-post", `${slideshowId}:tiktok:draft-v2`, "tiktok"),
        postfastPost("keep-post", "slideshow-keep:tiktok:draft-v2", "tiktok"),
      ],
    })

    const automationsIdRoute = await import("./[id]/route")
    const deleteResponse = await automationsIdRoute.DELETE(
      new Request(`http://localhost/api/automations/${automationId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: automationId }) }
    )
    const deletePayload = await deleteResponse.json()
    const storedRuns = await readJsonArrayStore<{ id: string }>({
      rootDir: path.join(tempRoot, "data", "automations"),
      fileName: "runs.json",
      key: "runs",
    })
    const storedPosts = await readJsonArrayStore<{ id: string }>({
      rootDir: path.join(tempRoot, "data"),
      fileName: "postfast-posts.json",
      key: "posts",
    })

    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.deletedResultsCount).toBe(1)
    expect(deletePayload.deletedRunsCount).toBe(1)
    expect(deletePayload.deletedPostFastPostsCount).toBe(1)
    expect(storedRuns.map((run) => run.id)).toEqual(["keep-run"])
    expect(storedPosts.map((post) => post.id)).toEqual(["keep-post"])
  })
})

function automationRun(id: string, automationId: string, slideshowId: string) {
  return {
    id,
    automationId,
    automationTitle: "Cascade automation",
    scheduledFor: "2026-07-04T12:00:00.000Z",
    status: "succeeded",
    slideshowId,
    plan: {
      title: "Cascade automation",
      caption: "Caption",
      hashtags: "",
      hook: "Hook",
      imageCollectionIds: [],
      slides: [],
      slideCount: { mode: "static", count: 1 },
      publishType: "slideshow",
      autoMusic: true,
      autoPost: false,
      language: "English",
    },
    createdAt: "2026-07-04T12:00:00.000Z",
    updatedAt: "2026-07-04T12:00:00.000Z",
  }
}

function postfastPost(id: string, sourceId: string, provider: string) {
  return {
    id,
    sourceType: "slideshow",
    sourceId,
    integrationId: `${provider}-integration`,
    provider,
    status: "draft",
    content: "Caption",
    media: [],
    createdAt: "2026-07-04T12:00:00.000Z",
    updatedAt: "2026-07-04T12:00:00.000Z",
  }
}
