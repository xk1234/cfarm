import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getRow: vi.fn(),
  updateRow: vi.fn(),
}))

vi.mock("@/lib/appwrite", () => ({
  APPWRITE_DATABASE_ID: "cfarm",
  getAppwrite: () => ({
    tables: {
      getRow: mocks.getRow,
      updateRow: mocks.updateRow,
    },
  }),
}))
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({ $id: "owner-1" })
  mocks.getRow.mockResolvedValue({
    $id: "job-1",
    type: "run-automation",
    status: "dead",
    payload: JSON.stringify({ automationId: "automation-1" }),
    result: JSON.stringify({ partial: true }),
    error: "Provider returned error",
    attempts: 3,
    max_attempts: 3,
    available_at: "2026-07-17T00:00:00.000Z",
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:03:00.000Z",
    owner_id: "owner-1",
  })
  mocks.updateRow.mockResolvedValue({})
})

describe("retryGenerationJob", () => {
  it("requeues an owned dead generation and resets its attempt budget", async () => {
    const { retryGenerationJob } = await import("./queue")
    const result = await retryGenerationJob("job-1")

    expect(result).toEqual(
      expect.objectContaining({
        retried: true,
        job: expect.objectContaining({
          id: "job-1",
          status: "queued",
          attempts: 0,
          error: null,
          result: null,
        }),
      })
    )
    expect(mocks.updateRow).toHaveBeenCalledWith(
      "cfarm",
      "jobs",
      "job-1",
      expect.objectContaining({
        status: "queued",
        attempts: 0,
        leased_by: null,
        leased_until: null,
        result: null,
        error: null,
      })
    )
  })

  it("does not expose or retry a job owned by another user", async () => {
    mocks.getRow.mockResolvedValueOnce({
      $id: "job-1",
      type: "run-automation",
      status: "dead",
      owner_id: "owner-2",
    })
    const { retryGenerationJob } = await import("./queue")

    await expect(retryGenerationJob("job-1")).resolves.toBeNull()
    expect(mocks.updateRow).not.toHaveBeenCalled()
  })
})
