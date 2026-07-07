import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createResultRecord } from "@/lib/results"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-results-route-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

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
