import { beforeEach, describe, expect, it, vi } from "vitest"

import { authenticateApiKey } from "@/lib/api-keys"
import { resetMemoryRepositories, type Repositories } from "@/lib/data"

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))

let repos: Repositories

beforeEach(() => {
  repos = resetMemoryRepositories()
  mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
})

const post = (body: unknown) =>
  new Request("http://localhost/api/settings/api-keys", { method: "POST", body: JSON.stringify(body) })

describe("API key settings", () => {
  it("creates a key, shows the secret once, and never lists the hash", async () => {
    const { GET, POST } = await import("./route")
    const response = await POST(post({ name: "Zapier", scopes: ["renders:write", "renders:read"] }))
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.secret).toMatch(/^lc_[0-9a-f]{6}_[0-9A-Za-z]{32}$/)
    expect(created.apiKey).toMatchObject({ name: "Zapier", scopes: ["renders:write", "renders:read"] })
    expect(created.apiKey.keyHash).toBeUndefined()

    const principal = await authenticateApiKey(repos, created.secret)
    expect(principal).toMatchObject({ workspaceId: "user-1", kind: "api_key" })

    const listed = await (await GET()).json()
    expect(listed.apiKeys).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(created.secret)
    expect(listed.apiKeys[0].keyHash).toBeUndefined()
  })

  it("rejects bad input", async () => {
    const { POST } = await import("./route")
    expect((await POST(post({ name: "" }))).status).toBe(400)
    expect((await POST(post({ name: "x", scopes: ["admin"] }))).status).toBe(400)
  })

  it("revokes a key so it stops authenticating", async () => {
    const { POST } = await import("./route")
    const { DELETE } = await import("./[id]/route")
    const created = await (await POST(post({ name: "CLI" }))).json()
    const response = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: created.apiKey.id }) })
    expect(response.status).toBe(204)
    expect(await authenticateApiKey(repos, created.secret)).toBeNull()

    mocks.getCurrentUser.mockResolvedValue({ $id: "someone-else" })
    const foreign = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: created.apiKey.id }) })
    expect(foreign.status).toBe(404)
  })

  it("requires a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const { GET } = await import("./route")
    expect((await GET()).status).toBe(401)
  })
})
