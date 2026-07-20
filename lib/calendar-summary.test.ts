import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
}))

vi.mock("@/lib/appwrite", () => ({
  APPWRITE_DATABASE_ID: "cfarm",
  getAppwrite: () => ({ tables: { listRows: mocks.listRows } }),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ $id: "owner-1" }),
}))

import { calendarAlertSummary } from "@/lib/calendar-summary"

describe("calendarAlertSummary", () => {
  beforeEach(() => mocks.listRows.mockReset())

  it("uses bounded count queries instead of loading the full calendar", async () => {
    mocks.listRows
      .mockResolvedValueOnce({ rows: [{ status: "dead" }], total: 3 })
      .mockResolvedValueOnce({ rows: [{}], total: 1 })
      .mockResolvedValueOnce({ rows: [{}], total: 1 })

    await expect(calendarAlertSummary()).resolves.toEqual({
      needsAction: 1,
      failed: 4,
    })
    expect(mocks.listRows).toHaveBeenCalledTimes(3)
  })
})
