import { beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  readJsonArrayRecord: vi.fn(),
  upsertJsonArrayRecord: vi.fn(),
  deleteJsonArrayRecord: vi.fn(),
}))

vi.mock("@/lib/json-store", () => ({
  readJsonArrayRecord: store.readJsonArrayRecord,
  upsertJsonArrayRecord: store.upsertJsonArrayRecord,
  deleteJsonArrayRecord: store.deleteJsonArrayRecord,
}))

import {
  deleteBrandProfile,
  getBrandProfile,
  normalizeBrandProfile,
  saveBrandProfile,
} from "@/lib/brand-profile"

beforeEach(() => {
  store.record = null
  store.readJsonArrayRecord
    .mockReset()
    .mockImplementation(async (input) =>
      store.record ? input.normalize(store.record) : null
    )
  store.upsertJsonArrayRecord.mockReset().mockImplementation(async (input) => {
    store.record = input.record
  })
  store.deleteJsonArrayRecord.mockReset().mockResolvedValue(true)
})

describe("brand profile", () => {
  it("normalizes lists and requires the brand identity fields", () => {
    expect(
      normalizeBrandProfile({ niche: "", audience: "founders" })
    ).toBeNull()
    expect(
      normalizeBrandProfile({
        niche: " B2B SaaS ",
        audience: " operators ",
        voice: ["direct", "direct", "warm"],
        pillars: ["growth"],
        proofPoints: [],
        prohibitedClaims: ["guaranteed ROI"],
        palette: { primary: " #123456 ", accent: "" },
      })
    ).toMatchObject({
      id: "brand-profile",
      niche: "B2B SaaS",
      audience: "operators",
      voice: ["direct", "warm"],
      palette: { primary: "#123456" },
    })
  })

  it("creates, reads, updates, and deletes one deterministic profile", async () => {
    const first = await saveBrandProfile({
      niche: "developer tools",
      audience: "staff engineers",
      voice: ["precise"],
      pillars: ["reliability"],
      proofPoints: ["10 years in production"],
      prohibitedClaims: ["zero downtime"],
    })
    expect(first.id).toBe("brand-profile")
    await expect(getBrandProfile()).resolves.toEqual(first)

    const updated = await saveBrandProfile({
      ...first,
      audience: "engineering leaders",
    })
    expect(updated.createdAt).toBe(first.createdAt)
    expect(updated.audience).toBe("engineering leaders")
    expect(store.upsertJsonArrayRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ id: "brand-profile" }),
      })
    )
    await expect(deleteBrandProfile()).resolves.toBe(true)
    expect(store.deleteJsonArrayRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: "brand-profile" })
    )
  })
})
