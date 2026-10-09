import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  forkSlideshowWorkflow: vi.fn(),
  getCurrentUser: vi.fn(),
  withSystemOwner: vi.fn(
    async (_ownerId: string, task: () => Promise<unknown>) => task()
  ),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))

vi.mock("@/lib/system-owner-context", () => ({
  withSystemOwner: mocks.withSystemOwner,
}))

vi.mock("@/lib/slideshow-workflow-fork", () => ({
  forkSlideshowWorkflow: mocks.forkSlideshowWorkflow,
  WorkflowForkError: class WorkflowForkError extends Error {
    constructor(
      public readonly status: number,
      message: string
    ) {
      super(message)
    }
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({
    $id: "user-1",
    email: "user@example.com",
    name: "User",
  })
  mocks.forkSlideshowWorkflow.mockResolvedValue({
    groupId: "fork-1",
    parentRunId: "run-1",
    runs: [],
  })
})

describe("POST /api/automations/runs/[id]/fork", () => {
  it("runs validated variations inside the authenticated owner scope", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/runs/run-1/fork", {
        method: "POST",
        body: JSON.stringify({
          stageId: "generate-text",
          scope: "input",
          path: "/messages/1/content",
          variations: [{ name: "Direct", replacement: "replacement" }],
        }),
      }),
      { params: Promise.resolve({ id: "run-1" }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.withSystemOwner).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function)
    )
    expect(mocks.forkSlideshowWorkflow).toHaveBeenCalledWith("user-1", {
      parentRunId: "run-1",
      stageId: "generate-text",
      scope: "input",
      path: "/messages/1/content",
      variations: [{ name: "Direct", replacement: "replacement" }],
    })
  })

  it("rejects invalid or empty selections", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/runs/run-1/fork", {
        method: "POST",
        body: JSON.stringify({
          stageId: "generate-text",
          path: "/messages/1/content",
          selectionStart: 4,
          selectionEnd: 4,
          selectedText: "",
          variations: [],
        }),
      }),
      { params: Promise.resolve({ id: "run-1" }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.forkSlideshowWorkflow).not.toHaveBeenCalled()
  })
})
