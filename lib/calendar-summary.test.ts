import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listRows: vi.fn(),
  canonicalList: vi.fn(),
}))

vi.mock("@/lib/appwrite", () => ({
  APPWRITE_DATABASE_ID: "cfarm",
  getAppwrite: () => ({ tables: { listRows: mocks.listRows } }),
}))

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ $id: "owner-1" }),
}))
vi.mock("@/lib/output-publications", () => ({
  outputPublicationsOwnerId: vi.fn(async () => "owner-1"),
  writeCanonicalPostWithLegacyProjection: vi.fn(),
}))
vi.mock("@/lib/post-repository-appwrite", () => ({
  appwritePostRepository: {
    listPosts: mocks.canonicalList,
  },
}))

import { calendarAlertSummary } from "@/lib/calendar-summary"

describe("calendarAlertSummary", () => {
  beforeEach(() => {
    mocks.listRows.mockReset()
    mocks.canonicalList.mockReset()
    delete process.env.POST_REPOSITORY_READ_MODE
  })

  afterEach(() => {
    delete process.env.POST_REPOSITORY_READ_MODE
  })

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

  it("keeps alert counts stable in all read modes and shadows drift", async () => {
    const ready = canonicalSummaryPost({
      id: "ready-post",
      lifecycleStatus: "ready",
      publishMode: "review",
    })
    const failed = canonicalSummaryPost({
      id: "failed-post",
      lifecycleStatus: "failed",
    })
    mocks.canonicalList.mockResolvedValue([ready, failed])

    const summaries = []
    for (const mode of ["legacy", "canonical", "union-shadow"] as const) {
      process.env.POST_REPOSITORY_READ_MODE = mode
      mocks.listRows.mockReset()
      mocks.listRows.mockResolvedValueOnce({ rows: [], total: 3 })
      if (mode !== "canonical") {
        mocks.listRows
          .mockResolvedValueOnce({ rows: [], total: 1 })
          .mockResolvedValueOnce({ rows: [], total: 1 })
      }
      summaries.push(await calendarAlertSummary())
    }
    expect(summaries).toEqual([
      { needsAction: 1, failed: 4 },
      { needsAction: 1, failed: 4 },
      { needsAction: 1, failed: 4 },
    ])

    mocks.canonicalList.mockResolvedValue([ready])
    mocks.listRows.mockReset()
    mocks.listRows
      .mockResolvedValueOnce({ rows: [], total: 3 })
      .mockResolvedValueOnce({ rows: [], total: 1 })
      .mockResolvedValueOnce({ rows: [], total: 1 })
    process.env.POST_REPOSITORY_READ_MODE = "union-shadow"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    await expect(calendarAlertSummary()).resolves.toEqual(summaries[0])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"surface":"calendar_alert_summary"')
    )
    warn.mockRestore()
  })
})

function canonicalSummaryPost(
  overrides: Partial<{
    id: string
    lifecycleStatus:
      | "generated"
      | "ready"
      | "scheduled"
      | "published"
      | "failed"
    publishMode: "auto" | "review" | "manual"
  }>
) {
  return {
    schemaVersion: 1 as const,
    id: overrides.id ?? "post",
    intentId: `intent:${overrides.id ?? "post"}`,
    ownerId: "owner-1",
    origin: "automation_generation" as const,
    sourceRefs: [],
    lifecycleStatus: overrides.lifecycleStatus ?? ("generated" as const),
    publishMode: overrides.publishMode,
    linkState: "unlinked" as const,
    statsSources: [],
    content: "",
    hashtags: [],
    media: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  }
}
