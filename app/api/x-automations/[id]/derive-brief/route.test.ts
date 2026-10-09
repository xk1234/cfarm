import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { clearTestTables } from "@/lib/test-helpers"

const clearAutomations = () => clearTestTables("x_automations")

beforeEach(async () => {
  await clearAutomations()
  vi.resetModules()
  vi.stubEnv("OPENROUTER_API_KEY", "test-key")
})

afterAll(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await clearAutomations()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("POST /api/x-automations/[id]/derive-brief", () => {
  it("persists bounded provider diagnostics and returns a retryable error", async () => {
    const { createXAutomation, getXAutomation, upsertXAutomation } =
      await import("@/lib/x-automation-store")
    const created = await createXAutomation({ name: "Retry test" })
    await upsertXAutomation({
      ...created,
      niche: { ...created.niche, label: "creator systems" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { message: "provider busy" } }, { status: 503 })
      )
    )

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/x-automations/test/derive-brief", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: created.id }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload).toMatchObject({
      retryable: true,
      operation: {
        kind: "derive_brief",
        status: "failed",
        retryable: true,
      },
    })
    expect(payload.operation.attempts).toHaveLength(3)
    expect((await getXAutomation(created.id))?.operations.at(-1)).toMatchObject(
      {
        id: payload.operation.id,
        status: "failed",
        retryable: true,
      }
    )
  })
})
