import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserPreferences: vi.fn(),
  mcpToolSettings: vi.fn(),
  setMcpToolEnabled: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getUserPreferences: mocks.getUserPreferences,
}))

vi.mock("@/lib/mcp/tool-access", () => ({
  mcpToolSettings: mocks.mcpToolSettings,
  setMcpToolEnabled: mocks.setMcpToolEnabled,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
  mocks.getUserPreferences.mockResolvedValue({ disabledMcpToolNames: [] })
  mocks.mcpToolSettings.mockReturnValue([
    { name: "lumenclip_output_delete", category: "outputs", enabled: true },
  ])
  mocks.setMcpToolEnabled.mockResolvedValue([
    { name: "lumenclip_output_delete", category: "outputs", enabled: false },
  ])
})

describe("MCP settings API", () => {
  it("returns the authenticated user's tool states", async () => {
    const { GET } = await import("./route")
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tools: [
        {
          name: "lumenclip_output_delete",
          category: "outputs",
          enabled: true,
        },
      ],
    })
    expect(mocks.getUserPreferences).toHaveBeenCalledWith("user-1")
  })

  it("persists a disabled MCP API", async () => {
    const { PATCH } = await import("./route")
    const response = await PATCH(
      new Request("http://localhost/api/settings/mcp", {
        method: "PATCH",
        body: JSON.stringify({
          toolName: "lumenclip_output_delete",
          enabled: false,
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.setMcpToolEnabled).toHaveBeenCalledWith(
      "user-1",
      "lumenclip_output_delete",
      false
    )
  })

  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const { GET } = await import("./route")

    expect((await GET()).status).toBe(401)
  })
})
