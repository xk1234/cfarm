import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRecords: vi.fn(),
  listAutomationRuns: vi.fn(),
  listGeneratedVideoExports: vi.fn(),
  listJobs: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  listMetricSnapshots: vi.fn(),
  canonicalList: vi.fn(),
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
vi.mock("@/lib/postfast-metric-snapshots", () => ({
  listMetricSnapshots: mocks.listMetricSnapshots,
}))
vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: vi.fn(async () => "owner-1"),
  writeCanonicalPostWithLegacyProjection: vi.fn(),
}))
vi.mock("@/lib/post-repository-appwrite", () => ({
  appwritePostRepository: {
    listPosts: mocks.canonicalList,
  },
}))
vi.mock("@/lib/queue", () => ({ listJobs: mocks.listJobs }))
vi.mock("@/lib/automation-run-progress", () => ({
  automationRunProgress: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.POST_REPOSITORY_READ_MODE
  mocks.listAutomationRecords.mockResolvedValue([])
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listGeneratedVideoExports.mockResolvedValue([])
  mocks.listJobs.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.listMetricSnapshots.mockResolvedValue([])
  mocks.canonicalList.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.POST_REPOSITORY_READ_MODE
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

  it("keeps run analytics stable in all modes and uses canonical snapshots", async () => {
    const run = {
      id: "run-analytics",
      automationId: "automation-1",
      automationTitle: "Daily property update",
      scheduledFor: "2026-07-17T04:00:00.000Z",
      status: "succeeded",
      slideshowId: "slideshow-analytics",
      createdAt: "2026-07-17T03:59:00.000Z",
      updatedAt: "2026-07-17T04:01:00.000Z",
      plan: { title: "Daily property update", slides: [] },
    }
    const publication = {
      id: "post-analytics",
      sourceType: "slideshow",
      sourceId: run.slideshowId,
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "published",
      linkState: "postfast_published",
      statsSources: ["postfast"],
      content: "Published post",
      media: [],
      analytics: [
        {
          label: "Views",
          data: [{ date: "2026-07-17", total: 10 }],
        },
      ],
      createdAt: "2026-07-17T04:00:00.000Z",
      updatedAt: "2026-07-17T04:00:00.000Z",
    }
    const canonical = {
      schemaVersion: 1 as const,
      id: publication.id,
      intentId: `legacy:${publication.id}`,
      ownerId: "owner-1",
      origin: "postfast_publish" as const,
      sourceType: "slideshow" as const,
      sourceId: publication.sourceId,
      sourceRefs: [
        { kind: "slideshow" as const, id: publication.sourceId },
        { kind: "run" as const, id: run.id },
      ],
      outputId: publication.sourceId,
      runId: run.id,
      lifecycleStatus: "published" as const,
      linkState: "postfast_managed" as const,
      linkMethod: "postfast" as const,
      integrationId: publication.integrationId,
      provider: "tiktok" as const,
      statsSources: ["postfast" as const],
      content: publication.content,
      hashtags: [],
      media: [],
      createdAt: publication.createdAt,
      updatedAt: publication.updatedAt,
    }
    mocks.listAutomationRuns.mockResolvedValue([run])
    mocks.listPostFastPostRecords.mockResolvedValue([publication])
    mocks.canonicalList.mockResolvedValue([canonical])
    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "snapshot-analytics",
        postId: publication.id,
        integrationId: publication.integrationId,
        provider: publication.provider,
        capturedAt: "2026-07-17T05:00:00.000Z",
        metrics: { views: 10 },
      },
    ])

    const payloads = []
    for (const mode of ["legacy", "canonical", "union-shadow"] as const) {
      process.env.POST_REPOSITORY_READ_MODE = mode
      const { GET } = await import("./route")
      const response = await GET(
        new Request(
          "http://localhost/api/automations/runs?automationId=automation-1"
        )
      )
      payloads.push(await response.json())
    }
    expect(payloads[1]).toEqual(payloads[0])
    expect(payloads[2]).toEqual(payloads[0])
    expect(payloads[0].runs[0].views).toBe(10)

    mocks.listMetricSnapshots.mockResolvedValue([
      {
        id: "snapshot-analytics",
        postId: publication.id,
        integrationId: publication.integrationId,
        provider: publication.provider,
        capturedAt: "2026-07-17T05:00:00.000Z",
        metrics: { views: 20 },
      },
    ])
    process.env.POST_REPOSITORY_READ_MODE = "union-shadow"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/automations/runs?automationId=automation-1"
      )
    )
    expect(await response.json()).toEqual(payloads[0])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"automation_runs_analytics"')
    )
    warn.mockRestore()
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
