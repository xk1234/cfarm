import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentUser } from "@/lib/auth"
import { getAutomationRecord } from "@/lib/automations"
import { queueSlideshowTemplateWorkflow } from "@/lib/generation-workflows"

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/automations", () => ({ getAutomationRecord: vi.fn() }))
vi.mock("@/lib/generation-workflows", () => ({
  queueSlideshowTemplateWorkflow: vi.fn(),
}))

const template = {
  id: "template-1",
  schema: { automationKind: "slideshow" },
}

describe("POST /api/templates/run", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentUser).mockResolvedValue({ $id: "owner-1" } as never)
    vi.mocked(getAutomationRecord).mockResolvedValue(template as never)
    vi.mocked(queueSlideshowTemplateWorkflow).mockResolvedValue({
      workflowId: "slideshow-generation",
      requestId: "request-1",
      status: "queued",
      jobId: "job-1",
      flowPath: "f/lumenclip/slideshow_generation",
    })
  })

  it("runs the persisted slideshow through Windmill without accepting client schema", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/templates/run", {
        method: "POST",
        body: JSON.stringify({
          templateId: "template-1",
          requestId: "request-1",
          hook: "Exact hook",
          now: "2026-08-01T10:00:00.000Z",
          force: true,
          schema: { title: "untrusted client schema" },
        }),
      })
    )

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({
      status: "queued",
      pollUrl: "/api/workflow-runs/job-1",
    })
    expect(queueSlideshowTemplateWorkflow).toHaveBeenCalledWith({
      templateId: "template-1",
      ownerId: "owner-1",
      requestId: "request-1",
      hook: "Exact hook",
      scheduledFor: "2026-08-01T10:00:00.000Z",
      generationSource: "manual",
    })
    expect(
      vi.mocked(queueSlideshowTemplateWorkflow).mock.calls[0]?.[0]
    ).not.toHaveProperty("schema")
  })

  it("requires an authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/templates/run", {
        method: "POST",
        body: JSON.stringify({ templateId: "template-1", force: true }),
      })
    )
    expect(response.status).toBe(401)
    expect(queueSlideshowTemplateWorkflow).not.toHaveBeenCalled()
  })

  it("surfaces queue submission failures without holding the request open", async () => {
    vi.mocked(queueSlideshowTemplateWorkflow).mockRejectedValue(
      new Error("Windmill unavailable")
    )
    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/templates/run", {
        method: "POST",
        body: JSON.stringify({ templateId: "template-1", force: true }),
      })
    )
    expect(response.status).toBe(500)
  })
})
