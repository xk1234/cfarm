import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAutomationRecord: vi.fn(),
  getJob: vi.fn(),
  getXAutomation: vi.fn(),
  retryGenerationJob: vi.fn(),
}))

vi.mock("@/lib/automations", () => ({
  getAutomationRecord: mocks.getAutomationRecord,
}))
vi.mock("@/lib/queue", () => ({
  getJob: mocks.getJob,
  retryGenerationJob: mocks.retryGenerationJob,
}))
vi.mock("@/lib/x-automation-store", () => ({
  getXAutomation: mocks.getXAutomation,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getJob.mockResolvedValue({
    id: "job-1",
    type: "run-automation",
    status: "dead",
    payload: { automationId: "automation-1" },
  })
  mocks.getAutomationRecord.mockResolvedValue({ id: "automation-1" })
  mocks.retryGenerationJob.mockResolvedValue({
    retried: true,
    job: { id: "job-1", status: "queued" },
  })
})

describe("POST /api/jobs/[id]/retry", () => {
  it("requeues a failed generation whose source automation still exists", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/jobs/job-1/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "job-1" }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      job: { id: "job-1", status: "queued" },
    })
    expect(mocks.retryGenerationJob).toHaveBeenCalledWith("job-1")
  })

  it("does not requeue a job after its source automation was deleted", async () => {
    mocks.getAutomationRecord.mockResolvedValueOnce(null)
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/jobs/job-1/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "job-1" }) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error:
        "The source automation no longer exists. Restore it before retrying this generation.",
    })
    expect(mocks.retryGenerationJob).not.toHaveBeenCalled()
  })
})
