import { describe, expect, it, vi } from "vitest"

vi.mock("pdf-parse", () => ({ default: vi.fn() }))
vi.mock("@fal-ai/client", () => ({ fal: { config: vi.fn() } }))
vi.mock("./slideshow-automation.js", () => ({
  runSlideshowAutomation: vi.fn(),
}))

import { findCandidates } from "./main.js"

describe("job worker candidate queries", () => {
  it("does not query expired leases when queued work exists", async () => {
    const queued = { $id: "queued-1", status: "queued" }
    const listRows = vi.fn().mockResolvedValueOnce({ rows: [queued] })

    await expect(findCandidates({ listRows })).resolves.toEqual([queued])
    expect(listRows).toHaveBeenCalledTimes(1)
  })

  it("checks expired leases only when the queued query is empty", async () => {
    const stale = { $id: "stale-1", status: "processing" }
    const listRows = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [stale] })

    await expect(findCandidates({ listRows })).resolves.toEqual([stale])
    expect(listRows).toHaveBeenCalledTimes(2)
  })
})
