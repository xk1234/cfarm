import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import { createResultRecord } from "@/lib/results"

// Appwrite-only: `data/results/results.json` -> `results`, run against
// cfarm (forced by vitest.setup.ts), cleared between tests.
let tempRoot: string

const clearResults = () => clearTestTables("results")

beforeEach(async () => {
  await clearResults()
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-results-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

afterAll(clearResults)

describe("/api/results", () => {
  it("lists persisted results with automation and run filters", async () => {
    await createResultRecord({
      automationId: "automation-1",
      runId: "run-1",
      workflowType: "slideshow",
      title: "First result",
      status: "succeeded",
      artifacts: { slideshowId: "slideshow-1", outputImages: [] },
    })
    await createResultRecord({
      automationId: "automation-2",
      runId: "run-2",
      workflowType: "video",
      title: "Second result",
      status: "succeeded",
      artifacts: { videoUrl: "/video.mp4", outputImages: [] },
    })

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/results?automationId=automation-1&runId=run-1"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.resultsCount).toBe(1)
    expect(payload.results).toMatchObject([
      {
        automationId: "automation-1",
        runId: "run-1",
        workflowType: "slideshow",
        title: "First result",
      },
    ])
  })
})
