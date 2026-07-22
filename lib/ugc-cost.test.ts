import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getRow: vi.fn(), getCurrentUser: vi.fn() }))

vi.mock("@/lib/appwrite", () => ({
  APPWRITE_DATABASE_ID: "cfarm",
  getAppwrite: () => ({ tables: { getRow: mocks.getRow } }),
}))
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({ $id: "owner-1" })
  mocks.getRow.mockRejectedValue({ code: 404 })
})

describe("estimateUgcCost", () => {
  it("returns an itemized low-cost estimate with b-roll quantity", async () => {
    const { estimateUgcCost } = await import("./ugc-cost")
    const result = estimateUgcCost({
      actorSource: "generate",
      lipSyncTier: "standard",
      targetDurationSeconds: 60,
      brollCount: 3,
    })

    expect(result.tier).toBe("lowcost")
    expect(
      result.items.find((item) => item.stage === "lipsync")?.model
    ).toContain("veed")
    expect(result.items.find((item) => item.stage === "broll")).toMatchObject({
      quantity: 3,
      costUsd: 0.09,
    })
    expect(result.totalUsd).toBe(0.65)
  })

  it("uses Kling pricing for the premium tier", async () => {
    const { estimateUgcCost } = await import("./ugc-cost")
    const result = estimateUgcCost({
      actorSource: "generate",
      lipSyncTier: "premium",
      targetDurationSeconds: 60,
      brollCount: 3,
    })

    expect(result.tier).toBe("premium")
    expect(result.items.find((item) => item.stage === "lipsync")).toMatchObject(
      { model: expect.stringContaining("kling"), costUsd: 1.69 }
    )
    expect(result.totalUsd).toBe(2.14)
  })
})

describe("actualUgcCostFromLedger", () => {
  it("sums explicit ledger costs and derived usage for the owned run", async () => {
    mocks.getRow
      .mockResolvedValueOnce({
        data: JSON.stringify({
          kind: "ugc_provider",
          run_id: "run-1",
          stage: "actor",
          provider: "fal",
          model: "fal-ai/flux-2-pro",
          cost_usd: 0.06,
        }),
      })
      .mockResolvedValueOnce({
        data: JSON.stringify({
          kind: "ugc_provider",
          run_id: "run-1",
          stage: "voice",
          provider: "elevenlabs",
          model: "eleven_multilingual_v2",
          units: 900,
        }),
      })
      .mockRejectedValue({ code: 404 })
    const { actualUgcCostFromLedger } = await import("./ugc-cost")
    const result = await actualUgcCostFromLedger("run-1")

    expect(result.items).toHaveLength(2)
    expect(result.items.map((item) => item.source)).toEqual([
      "ledger",
      "derived",
    ])
    expect(result.totalUsd).toBe(0.15)
  })
})
