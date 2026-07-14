import { describe, expect, it } from "vitest"

import {
  slideshowDeletionBlockReason,
  slideshowStageForRunStatus,
} from "@/lib/slideshow-lifecycle"

describe("slideshow lifecycle", () => {
  it("exposes only generating and completed slideshow stages", () => {
    expect(slideshowStageForRunStatus("running")).toBe("generating")
    expect(slideshowStageForRunStatus("generating")).toBe("generating")
    expect(slideshowStageForRunStatus("succeeded")).toBe("completed")
    expect(slideshowStageForRunStatus("completed")).toBe("completed")
    expect(slideshowStageForRunStatus("failed")).toBeNull()
  })

  it("allows completed unpublished slideshows to be deleted", () => {
    expect(
      slideshowDeletionBlockReason({
        slideshowStatus: "exported",
        runStatus: "succeeded",
        slideshowId: "slideshow-1",
        runId: "run-1",
        posts: [],
      })
    ).toBeNull()
  })

  it("blocks published and scheduled slideshows", () => {
    expect(
      slideshowDeletionBlockReason({
        slideshowStatus: "exported",
        runStatus: "succeeded",
        slideshowId: "slideshow-1",
        runId: "run-1",
        posts: [
          {
            sourceType: "automation",
            sourceId: "run-1",
            status: "published",
          },
        ],
      })
    ).toBe("published")
    expect(
      slideshowDeletionBlockReason({
        slideshowStatus: "exported",
        runStatus: "succeeded",
        slideshowId: "slideshow-1",
        posts: [
          {
            sourceType: "slideshow",
            sourceId: "slideshow-1:tiktok",
            status: "scheduled",
          },
        ],
      })
    ).toBe("scheduled")
  })

  it("blocks unfinished and failed slideshow records", () => {
    expect(
      slideshowDeletionBlockReason({
        slideshowStatus: "exported",
        runStatus: "running",
        slideshowId: "slideshow-1",
        posts: [],
      })
    ).toBe("not_completed")
    expect(
      slideshowDeletionBlockReason({
        slideshowStatus: "failed",
        runStatus: "failed",
        slideshowId: "slideshow-1",
        posts: [],
      })
    ).toBe("not_completed")
  })
})
