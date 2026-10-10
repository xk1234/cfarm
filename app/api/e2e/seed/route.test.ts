import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/e2e-seed", () => ({
  seedE2eWorkspace: vi.fn(async () => ({ collections: [], renderId: "r1" })),
}))

import { POST } from "./route"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/e2e/seed", () => {
  it("is 404 without the e2e user id", async () => {
    vi.stubEnv("LUMENCLIP_E2E_USER_ID", "")
    expect((await POST()).status).toBe(404)
  })

  it("is 404 in production even with the e2e user id", async () => {
    vi.stubEnv("LUMENCLIP_E2E_USER_ID", "user_e2e")
    vi.stubEnv("NODE_ENV", "production")
    expect((await POST()).status).toBe(404)
  })

  it("is 404 on the appwrite backend even with the e2e user id", async () => {
    vi.stubEnv("LUMENCLIP_E2E_USER_ID", "user_e2e")
    vi.stubEnv("LUMENCLIP_DATA_BACKEND", "appwrite")
    expect((await POST()).status).toBe(404)
  })

  it("seeds when the seam is on", async () => {
    vi.stubEnv("LUMENCLIP_E2E_USER_ID", "user_e2e")
    vi.stubEnv("LUMENCLIP_DATA_BACKEND", "memory")
    const response = await POST()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ collections: [], renderId: "r1" })
  })
})
