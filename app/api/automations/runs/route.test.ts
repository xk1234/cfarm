import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRecords: vi.fn(),
  listAutomationRuns: vi.fn(),
  listGeneratedVideoExports: vi.fn(),
  listJobs: vi.fn(),
  listPostFastPostRecords: vi.fn(),
}))

vi.mock("@/lib/automations", () => ({
  listAutomationRecords: mocks.listAutomationRecords,
}))
vi.mock("@/lib/automation-runner", () => ({
  listAutomationRuns: mocks.listAutomationRuns,
}))
vi.mock("@/lib/generated-videos", () => ({
  listGeneratedVideoExports: mocks.listGeneratedVideoExports,
}))
vi.mock("@/lib/postfast-posts", () => ({
  listPostFastPostRecords: mocks.listPostFastPostRecords,
}))
vi.mock("@/lib/queue", () => ({ listJobs: mocks.listJobs }))
vi.mock("@/lib/automation-run-progress", () => ({
  automationRunProgress: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAutomationRecords.mockResolvedValue([])
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listGeneratedVideoExports.mockResolvedValue([])
  mocks.listJobs.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
})

describe("GET /api/automations/runs failed queue jobs", () => {
  it("returns a failed placeholder when the worker failed before creating a run", async () => {
    mocks.listAutomationRecords.mockResolvedValue([
      { id: "automation-1", name: "Daily property update" },
    ])
    mocks.listJobs.mockResolvedValue([
      generationJob({
        id: "job-1",
        status: "failed",
        error: "Image collection could not be loaded",
      }),
    ])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/automations/runs?automationId=automation-1&limit=20"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.runs).toEqual([
      expect.objectContaining({
        id: "job:job-1",
        automationId: "automation-1",
        automationTitle: "Daily property update",
        scheduledFor: "2026-07-17T04:00:00.000Z",
        generationSource: "scheduled",
        status: "failed",
        error: "Image collection could not be loaded",
        plan: expect.objectContaining({
          title: "Daily property update",
          slides: [],
          publishType: "slideshow",
        }),
      }),
    ])
    expect(mocks.listJobs).toHaveBeenCalledWith({
      type: "run-automation",
      limit: 100,
    })
    expect(mocks.listAutomationRecords).toHaveBeenCalledOnce()
  })

  it("does not duplicate a failed job once its run record exists", async () => {
    mocks.listAutomationRuns.mockResolvedValue([
      {
        id: "run-1",
        automationId: "automation-1",
        automationTitle: "Daily property update",
        scheduledFor: "2026-07-17T04:00:00.000Z",
        status: "failed",
        createdAt: "2026-07-17T03:59:00.000Z",
        updatedAt: "2026-07-17T04:01:00.000Z",
        error: "Image collection could not be loaded",
        plan: { title: "Daily property update", slides: [] },
      },
    ])
    mocks.listJobs.mockResolvedValue([
      generationJob({
        id: "job-1",
        status: "dead",
        result: { runId: "run-1" },
      }),
    ])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/automations/runs?automationId=automation-1"
      )
    )
    const payload = await response.json()

    expect(payload.runs).toHaveLength(1)
    expect(payload.runs[0].id).toBe("run-1")
  })

  it("skips the extra automation lookup when there are no failed jobs", async () => {
    mocks.listJobs.mockResolvedValue([
      generationJob({ id: "job-queued", status: "queued" }),
    ])

    const { GET } = await import("./route")
    await GET(new Request("http://localhost/api/automations/runs"))

    expect(mocks.listAutomationRecords).not.toHaveBeenCalled()
  })
})

function generationJob({
  id,
  status,
  error = null,
  result = null,
}: {
  id: string
  status: "queued" | "failed" | "dead"
  error?: string | null
  result?: unknown
}) {
  return {
    id,
    type: "run-automation",
    status,
    payload: {
      automationId: "automation-1",
      scheduledFor: "2026-07-17T04:00:00.000Z",
    },
    result,
    error,
    attempts: 3,
    maxAttempts: 3,
    availableAt: "2026-07-17T03:30:00.000Z",
    createdAt: "2026-07-17T03:30:00.000Z",
    updatedAt: "2026-07-17T04:01:00.000Z",
    ownerId: "user-1",
  }
}
