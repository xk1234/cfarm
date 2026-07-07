import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createResultRecord } from "@/lib/results"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-automations-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

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
    await mkdir(path.join(tempRoot, "data", "automations"), {
      recursive: true,
    })
    await writeFile(
      path.join(tempRoot, "data", "automations", "runs.json"),
      `${JSON.stringify(
        {
          runs: [
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
        },
        null,
        2
      )}\n`
    )
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

    const deleteResponse = await automationsRoute.DELETE(
      new Request(`http://localhost/api/automations?id=${automationId}`, {
        method: "DELETE",
      })
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

    await mkdir(path.join(tempRoot, "data", "automations"), {
      recursive: true,
    })
    await writeFile(
      path.join(tempRoot, "data", "automations", "runs.json"),
      `${JSON.stringify(
        {
          runs: [
            automationRun("delete-run", automationId, slideshowId),
            automationRun("keep-run", "automation-keep", "slideshow-keep"),
          ],
        },
        null,
        2
      )}\n`
    )
    await writeFile(
      path.join(tempRoot, "data", "postfast-posts.json"),
      `${JSON.stringify(
        {
          posts: [
            postfastPost(
              "delete-post",
              `${slideshowId}:tiktok:draft-v2`,
              "tiktok"
            ),
            postfastPost("keep-post", "slideshow-keep:tiktok:draft-v2", "tiktok"),
          ],
        },
        null,
        2
      )}\n`
    )

    const deleteResponse = await automationsRoute.DELETE(
      new Request(`http://localhost/api/automations?id=${automationId}`, {
        method: "DELETE",
      })
    )
    const deletePayload = await deleteResponse.json()
    const storedRuns = JSON.parse(
      await readFile(
        path.join(tempRoot, "data", "automations", "runs.json"),
        "utf8"
      )
    )
    const storedPosts = JSON.parse(
      await readFile(path.join(tempRoot, "data", "postfast-posts.json"), "utf8")
    )

    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.deletedResultsCount).toBe(1)
    expect(deletePayload.deletedRunsCount).toBe(1)
    expect(deletePayload.deletedPostFastPostsCount).toBe(1)
    expect(storedRuns.runs.map((run: { id: string }) => run.id)).toEqual([
      "keep-run",
    ])
    expect(storedPosts.posts.map((post: { id: string }) => post.id)).toEqual([
      "keep-post",
    ])
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
