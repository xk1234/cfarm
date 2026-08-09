import { afterEach, describe, expect, it, vi } from "vitest"

const { runProductionPipelineStage } = vi.hoisted(() => ({
  runProductionPipelineStage: vi.fn(),
}))

vi.mock("@/lib/production-pipeline-runtime", () => ({
  runProductionPipelineStage,
}))

import { POST } from "@/app/api/internal/windmill/stages/[stageId]/route"

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("Windmill stage boundary", () => {
  it("rejects requests without the shared bearer secret", async () => {
    vi.stubEnv("WINDMILL_SHARED_SECRET", "shared-secret")
    const response = await POST(
      request({ ownerId: "owner-1", requestId: "request-1", input: {} }),
      context("linkedin-generation.validate-input")
    )

    expect(response.status).toBe(401)
    expect(runProductionPipelineStage).not.toHaveBeenCalled()
  })

  it("executes exactly the requested stage for an authorized owner", async () => {
    vi.stubEnv("WINDMILL_SHARED_SECRET", "shared-secret")
    runProductionPipelineStage.mockResolvedValue({
      stage: { id: "linkedin-generation.validate-input" },
      requestId: "request-1",
      status: "succeeded",
      externalCalls: 0,
      output: { normalizedInput: { niche: "SaaS" } },
    })
    const response = await POST(
      request(
        {
          ownerId: "owner-1",
          requestId: "request-1",
          input: { niche: "SaaS" },
        },
        "Bearer shared-secret"
      ),
      context("linkedin-generation.validate-input")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      execution: {
        stage: { id: "linkedin-generation.validate-input" },
        status: "succeeded",
      },
    })
    expect(runProductionPipelineStage).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        requestId: "request-1",
        stageId: "linkedin-generation.validate-input",
        stageInput: { niche: "SaaS" },
      })
    )
  })
})

function request(body: unknown, authorization?: string) {
  return new Request(
    "https://lumenclip.example/api/internal/windmill/stages/test",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify(body),
    }
  )
}

function context(stageId: string) {
  return { params: Promise.resolve({ stageId }) }
}
