import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAutomationRuns: vi.fn(),
  listGeneratedVideoExports: vi.fn(),
  listPostFastPostRecords: vi.fn(),
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
  mocks.listAutomationRuns.mockResolvedValue([])
  mocks.listGeneratedVideoExports.mockResolvedValue([])
  mocks.listPostFastPostRecords.mockResolvedValue([])
  mocks.canonicalList.mockResolvedValue([])
  mocks.getCurrentUser.mockResolvedValue({ $id: "owner-1" })
})

describe("GET /api/templates/runs", () => {
  it("caps requested list sizes", async () => {
    const { GET } = await import("./route")
    const response = await GET(
      new Request("http://localhost/api/templates/runs?limit=999999.9")
    )

    expect(response.status).toBe(200)
    expect(mocks.listAutomationRuns).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    )
  })

  it("loads one requested run through targeted slideshow and video lookups", async () => {
    const requestedRun = {
      id: "run-requested",
      automationId: "automation-1",
      automationTitle: "Daily property update",
      status: "succeeded",
      slideshowId: "slideshow-requested",
      createdAt: "2026-07-17T03:59:00.000Z",
      updatedAt: "2026-07-17T04:01:00.000Z",
      plan: { title: "Daily property update", slides: [] },
    }
    mocks.listAutomationRuns.mockResolvedValue([requestedRun])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/templates/runs?templateId=automation-1&runId=slideshow-requested&limit=1"
      )
    )

    expect(response.status).toBe(200)
    expect(mocks.listAutomationRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "automation-1",
        runId: "slideshow-requested",
        limit: 1,
      })
    )
    expect(mocks.listGeneratedVideoExports).toHaveBeenCalledWith({
      id: "slideshow-requested",
      automationId: "automation-1",
    })
    expect(await response.json()).toMatchObject({
      runs: [expect.objectContaining({ id: "run-requested" })],
    })
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce()
  })

  it("returns card-sized summaries without full run artifacts", async () => {
    const run = {
      id: "run-summary",
      automationId: "automation-1",
      automationTitle: "Daily property update",
      scheduledFor: "2026-07-17T04:00:00.000Z",
      generationSource: "scheduled",
      status: "succeeded",
      slideshowId: "slideshow-summary",
      createdAt: "2026-07-17T03:59:00.000Z",
      updatedAt: "2026-07-17T04:01:00.000Z",
      outputImages: [
        "https://example.com/one.png",
        "https://example.com/two.png",
      ],
      renderedSlides: [
        {
          id: "slide-1",
          imageUrl: "https://example.com/one.png",
          text: "First",
          durationMs: 3_000,
        },
        {
          id: "slide-2",
          imageUrl: "https://example.com/two.png",
          text: "Second",
          durationMs: 5_000,
        },
      ],
      plan: {
        title: "Daily property update",
        hook: "A concise hook",
        publishType: "video",
        language: "English",
        debug: { textModelPrompt: { messages: ["large prompt"] } },
        hookCandidates: ["one", "two"],
        slides: [],
      },
    }
    mocks.listAutomationRuns.mockResolvedValue([run])

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/templates/runs?templateId=automation-1&view=summary"
      )
    )
    const payload = await response.json()

    expect(payload.runs[0]).toMatchObject({
      id: "run-summary",
      durationSeconds: 8,
      renderedSlides: [{ id: "slide-1" }],
      plan: {
        title: "Daily property update",
        hook: "A concise hook",
        publishType: "video",
      },
    })
    expect(payload.runs[0].renderedSlides).toHaveLength(1)
    expect(payload.runs[0]).not.toHaveProperty("outputImages")
    expect(payload.runs[0]).not.toHaveProperty("workflowUrl")
    expect(payload.runs[0].plan).not.toHaveProperty("debug")
    expect(payload.runs[0].plan).not.toHaveProperty("hookCandidates")
    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
  })
})
