import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  refreshOwnedWorkflowRun: vi.fn(),
  resolveQueuedWorkflowResponse: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock("@/lib/workflow-run-store", () => ({
  refreshOwnedWorkflowRun: mocks.refreshOwnedWorkflowRun,
}))
vi.mock("@/lib/generation-workflows", () => ({
  resolveQueuedWorkflowResponse: mocks.resolveQueuedWorkflowResponse,
}))

import { GET } from "@/app/api/workflow-runs/[id]/route"

describe("GET /api/workflow-runs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue({ $id: "owner-1" })
  })

  it("returns a lightweight running state without waiting", async () => {
    mocks.refreshOwnedWorkflowRun.mockResolvedValue({
      jobId: "job-1",
      ownerId: "owner-1",
      status: "running",
    })
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "job-1" }),
    })
    await expect(response.json()).resolves.toMatchObject({
      status: "running",
      retryAfterMs: 2_000,
    })
  })

  it("hydrates the typed output only after Windmill succeeds", async () => {
    const run = {
      workflowId: "slideshow-generation",
      requestId: "request-1",
      jobId: "job-1",
      flowPath: "f/lumenclip/slideshow_generation",
      ownerId: "owner-1",
      templateId: "template-1",
      status: "succeeded",
      result: { run: { id: "run-1" } },
    }
    mocks.refreshOwnedWorkflowRun.mockResolvedValue(run)
    mocks.resolveQueuedWorkflowResponse.mockResolvedValue({
      created: [{ id: "run-1" }],
    })
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "job-1" }),
    })
    await expect(response.json()).resolves.toMatchObject({
      status: "succeeded",
      value: { created: [{ id: "run-1" }] },
    })
    expect(mocks.resolveQueuedWorkflowResponse).toHaveBeenCalledOnce()
  })
})
