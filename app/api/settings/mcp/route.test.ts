import { beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"
import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))

let repos: Repositories

beforeEach(() => {
  vi.clearAllMocks()
  repos = resetMemoryRepositories()
  mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
})

function patch(body: unknown) {
  return new Request("http://localhost/api/settings/mcp", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

describe("MCP settings API", () => {
  it("returns every tool enabled by default", async () => {
    const { GET } = await import("./route")
    const response = await GET()

    expect(response.status).toBe(200)
    const { tools } = await response.json()
    expect(tools.map((t: { name: string }) => t.name)).toEqual(LUMENCLIP_MCP_TOOL_NAMES)
    expect(tools.every((t: { enabled: boolean }) => t.enabled)).toBe(true)
  })

  it("persists a disabled MCP API in workspace settings", async () => {
    const { GET, PATCH } = await import("./route")
    const response = await PATCH(patch({ toolName: "lumenclip_output_delete", enabled: false }))

    expect(response.status).toBe(200)
    expect((await repos.settings.get("user-1")).mcpDisabledTools).toEqual(["lumenclip_output_delete"])
    const { tools } = await (await GET()).json()
    expect(tools.find((t: { name: string }) => t.name === "lumenclip_output_delete").enabled).toBe(false)
  })

  it("rejects unknown tools", async () => {
    const { PATCH } = await import("./route")
    expect((await PATCH(patch({ toolName: "lumenclip_nope", enabled: false }))).status).toBe(400)
  })

  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const { GET } = await import("./route")

    expect((await GET()).status).toBe(401)
  })
})
