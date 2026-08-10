import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRuns: vi.fn(),
  listGeneratedVideoExports: vi.fn(),
  listPostFastPostRecords: vi.fn(),
  listMetricSnapshots: vi.fn(),
  canonicalList: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock("@/lib/automation-runner", () => ({
  listAutomationRuns: mocks.listAutomationRuns,
}))
vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
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
vi.mock("@/lib/automation-run-progress", () => ({
  automationRunProgress: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.POST_REPOSITORY_READ_MODE
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listGeneratedVideoExports.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.listMetricSnapshots.mockResolvedValue([])
  mocks.canonicalList.mockResolvedValue([])
  mocks.getCurrentUser.mockResolvedValue({ $id: "owner-1" })
})

afterEach(() => {
  delete process.env.POST_REPOSITORY_READ_MODE
})

describe("GET /api/templates/runs", () => {
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
          "http://localhost/api/templates/runs?templateId=automation-1"
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
      new Request("http://localhost/api/templates/runs?templateId=automation-1")
    )
    expect(await response.json()).toEqual(payloads[0])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"automation_runs_analytics"')
    )
    warn.mockRestore()
  })
})
