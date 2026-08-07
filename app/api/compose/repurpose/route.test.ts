import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveComposerSources: vi.fn(),
  openRouterJson: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock("@/lib/compose-sources.server", () => ({
  resolveComposerSources: mocks.resolveComposerSources,
}))
vi.mock("@/lib/openrouter", () => ({
  getOpenRouterApiKey: () => "test-key",
  openRouterJson: mocks.openRouterJson,
}))

import { POST } from "./route"

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.resolveComposerSources.mockReset()
  mocks.openRouterJson.mockReset()
  mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
})

describe("POST /api/compose/repurpose", () => {
  it("requires a stored template output", async () => {
    const response = await POST(
      request({ sourceOutputIds: [], platforms: ["x"] })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: "Choose at least one template output and platform",
    })
  })

  it("repurposes server-resolved output content for each platform", async () => {
    mocks.resolveComposerSources.mockResolvedValue([
      {
        id: "run-1",
        templateId: "template-1",
        templateName: "Slideshow",
        title: "Cancer",
        createdAt: "2026-08-07T00:00:00.000Z",
        kind: "slideshow",
        text: "Stored source caption",
        media: [],
      },
    ])
    mocks.openRouterJson.mockResolvedValue({
      x: { text: "X version", title: "" },
      tiktok: { text: "TikTok version", title: "" },
    })

    const response = await POST(
      request({ sourceOutputIds: ["run-1"], platforms: ["x", "tiktok"] })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      variants: {
        x: { text: "X version", title: "" },
        tiktok: { text: "TikTok version", title: "" },
      },
    })
    expect(mocks.openRouterJson).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("Stored source caption"),
      })
    )
  })
})

function request(body: unknown) {
  return new Request("http://localhost/api/compose/repurpose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
