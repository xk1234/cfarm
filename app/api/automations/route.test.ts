import path from "node:path"

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { clearTestTables } from "@/lib/test-helpers"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import { createResultRecord } from "@/lib/results"
import {
  listPostFastPostRecords,
  upsertPostFastPostRecord,
} from "@/lib/postfast-posts"
import { schemaWithAutomationHookItems } from "@/lib/realfarm-automation"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts). The real
// cwd's data-relative paths map to the same tables the routes + seeds use.
const tempRoot = process.cwd()

const clearAll = () =>
  clearTestTables(
    "automations",
    "results",
    "automation_runs",
    "postfast_posts",
    "usage_ledger",
    "postfast_metric_snapshots"
  )

beforeEach(clearAll)

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

afterAll(clearAll)

describe("/api/automations", () => {
  it("locks a hook after a linked publication but still allows disabling it", async () => {
    const automationsRoute = await import("./route")
    const createdResponse = await automationsRoute.POST(
      new Request("http://localhost/api/automations", {
        method: "POST",
        body: JSON.stringify({ name: "Published hook guard" }),
      })
    )
    const createdPayload = await createdResponse.json()
    const automationId = createdPayload.record.id
    const hook = {
      id: "published-hook",
      text: "The hook with history",
      enabled: true,
      createdAt: "2026-07-18T00:00:00.000Z",
    }
    const schema = schemaWithAutomationHookItems(createdPayload.record.schema, [
      hook,
    ])
    const initialPatch = await automationsRoute.PATCH(
      new Request("http://localhost/api/automations", {
        method: "PATCH",
        body: JSON.stringify({ id: automationId, schema }),
      })
    )
    expect(initialPatch.status).toBe(200)

    await writeJsonArrayStore({
      rootDir: path.join(tempRoot, "data", "automations"),
      fileName: "runs.json",
      key: "runs",
      records: [
        {
          ...automationRun(
            "published-hook-run",
            automationId,
            "published-hook-slideshow"
          ),
          plan: {
            ...automationRun("x", automationId, "x").plan,
            hookId: hook.id,
            hook: hook.text,
            hookTemplate: hook.text,
            hookSubstitutions: {},
          },
        },
      ],
    })
    await upsertPostFastPostRecord({
      sourceType: "slideshow",
      sourceId: "published-hook-slideshow",
      integrationId: "tiktok-integration",
      provider: "tiktok",
      status: "published",
      publishedAt: "2026-07-18T02:00:00.000Z",
      releaseUrl: "https://www.tiktok.com/@demo/video/1234567890",
      content: "Caption",
      media: [],
    })

    const removeResponse = await automationsRoute.PATCH(
      new Request("http://localhost/api/automations", {
        method: "PATCH",
        body: JSON.stringify({
          id: automationId,
          schema: schemaWithAutomationHookItems(schema, []),
        }),
      })
    )
    expect(removeResponse.status).toBe(409)

    const disableResponse = await automationsRoute.PATCH(
      new Request("http://localhost/api/automations", {
        method: "PATCH",
        body: JSON.stringify({
          id: automationId,
          schema: schemaWithAutomationHookItems(schema, [
            { ...hook, enabled: false },
          ]),
        }),
      })
    )
    expect(disableResponse.status).toBe(200)
    expect((await disableResponse.json()).record.schema.hooks).toEqual([
      expect.objectContaining({ id: hook.id, enabled: false }),
    ])
  })

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
    await upsertPostFastPostRecord({
      ...postfastPost(`${slideshowId}:tiktok:draft-v2`, "tiktok"),
      rootDir: path.join(tempRoot, "data"),
    })
    const keepPost = await upsertPostFastPostRecord({
      ...postfastPost("slideshow-keep:tiktok:draft-v2", "tiktok"),
      rootDir: path.join(tempRoot, "data"),
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
    const storedPosts = await listPostFastPostRecords()

    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.deletedResultsCount).toBe(1)
    expect(deletePayload.deletedRunsCount).toBe(1)
    expect(deletePayload.deletedPostFastPostsCount).toBe(1)
    expect(storedRuns.map((run) => run.id)).toEqual(["keep-run"])
    expect(storedPosts.map((post) => post.id)).toEqual([keepPost.id])
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

function postfastPost(sourceId: string, provider: string) {
  return {
    sourceType: "slideshow" as const,
    sourceId,
    integrationId: `${provider}-integration`,
    provider,
    status: "draft" as const,
    content: "Caption",
    media: [],
  }
}
