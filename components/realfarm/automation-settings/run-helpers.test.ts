import { describe, expect, it } from "vitest"

import {
  automationOverviewRunState,
  canDeleteCompletedSlideshow,
  exportableAutomationRunSlides,
  isGeneratingSlideshowRun,
  reconcileGenerationPlaceholders,
  runPublishSchedule,
  runPublishedAt,
  runScheduleDurationLine,
  runStatusLabel,
  sortAutomationRuns,
} from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

describe("automation overview run sorting", () => {
  const olderPopular = run("popular", "2026-07-01T10:00:00.000Z", 900)
  const newerQuiet = run("newer", "2026-07-10T10:00:00.000Z", 20)
  const newestQuiet = run("newest", "2026-07-11T10:00:00.000Z", 20)

  it("sorts recent slideshows by creation time", () => {
    expect(
      sortAutomationRuns([olderPopular, newerQuiet, newestQuiet], "Recent").map(
        (item) => item.id
      )
    ).toEqual(["newest", "newer", "popular"])
  })

  it("sorts most-viewed slideshows by views and breaks ties by recency", () => {
    expect(
      sortAutomationRuns(
        [newerQuiet, olderPopular, newestQuiet],
        "Most viewed"
      ).map((item) => item.id)
    ).toEqual(["popular", "newest", "newer"])
  })

  it("labels successful output as not published and only allows unpublished deletion", () => {
    expect(runStatusLabel("running")).toBe("Generating")
    expect(runStatusLabel("succeeded")).toBe("Not published")
    expect(
      canDeleteCompletedSlideshow({
        ...newerQuiet,
        slideshowId: "slideshow-1",
        socialStatuses: [],
      })
    ).toBe(true)
    expect(
      canDeleteCompletedSlideshow({
        ...newerQuiet,
        slideshowId: "slideshow-1",
        socialStatuses: [
          {
            provider: "tiktok",
            integrationId: "account-1",
            name: "TikTok",
            status: "published",
          },
        ],
      })
    ).toBe(false)
    expect(runStatusLabel("succeeded", [], "2026-07-12T11:30:00.000Z")).toBe(
      "Published"
    )
    expect(
      canDeleteCompletedSlideshow({
        ...newerQuiet,
        slideshowId: "slideshow-1",
        manuallyPublishedAt: "2026-07-12T11:30:00.000Z",
      })
    ).toBe(false)
  })

  it("does not expose an auto-publish date for button-generated output", () => {
    expect(
      runPublishSchedule({
        ...newerQuiet,
        generationSource: "manual",
      })
    ).toBeUndefined()
    expect(
      runPublishSchedule({
        ...newerQuiet,
        generationSource: "scheduled",
      })
    ).toBe(newerQuiet.scheduledFor)
  })

  it("only shows duration for slideshow runs exported as video", () => {
    const slides = Array.from({ length: 9 }, (_, index) => ({
      id: `slide-${index + 1}`,
    }))
    const staticSlideshow = runScheduleDurationLine({
      ...newerQuiet,
      renderedSlides: slides,
      plan: { publishType: "slideshow" },
    })
    const exportedVideo = runScheduleDurationLine({
      ...newerQuiet,
      renderedSlides: slides,
      plan: { publishType: "video" },
    })

    expect(staticSlideshow).not.toContain("36s")
    expect(exportedVideo).toContain(" · 36s")
  })

  it("shows actual, scheduled, and queue-estimated publish dates in that order", () => {
    expect(
      runPublishedAt({ ...newerQuiet, generationSource: "manual" })
    ).toBeUndefined()
    expect(
      runPublishedAt({ ...newerQuiet, generationSource: "scheduled" })
    ).toBe(newerQuiet.scheduledFor)
    expect(
      runPublishedAt({
        ...newerQuiet,
        generationSource: "manual",
        manuallyPublishedAt: "2026-07-12T09:15:00.000Z",
      })
    ).toBe("2026-07-12T09:15:00.000Z")
    expect(
      runPublishedAt({
        ...newerQuiet,
        generationSource: "manual",
        socialStatuses: [
          {
            provider: "threads",
            integrationId: "threads-1",
            name: "Threads",
            status: "scheduled",
            scheduledAt: "2026-07-12T10:00:00.000Z",
          },
        ],
      })
    ).toBe("2026-07-12T10:00:00.000Z")
    expect(
      runPublishedAt({
        ...newerQuiet,
        generationSource: "scheduled",
        socialStatuses: [
          {
            provider: "threads",
            integrationId: "threads-1",
            name: "Threads",
            status: "published",
            publishedAt: "2026-07-12T11:30:00.000Z",
          },
        ],
      })
    ).toBe("2026-07-12T11:30:00.000Z")
  })

  it("shows an active run instead of covering it with the initial loading skeleton", () => {
    const generatingRun = { ...newestQuiet, status: "running" as const }

    expect(isGeneratingSlideshowRun(generatingRun)).toBe(true)
    expect(automationOverviewRunState([generatingRun], true)).toBe("runs")
    expect(automationOverviewRunState([], true)).toBe("loading")
    expect(automationOverviewRunState([], false)).toBe("empty")
  })

  it("replaces only the matching placeholder when concurrent runs persist", () => {
    const placeholderA: AutomationRunApiRecord = {
      ...newerQuiet,
      id: "generation-placeholder-automation-1-request-a",
      requestId: "request-a",
      status: "running",
    }
    const placeholderB: AutomationRunApiRecord = {
      ...newerQuiet,
      id: "generation-placeholder-automation-1-request-b",
      requestId: "request-b",
      status: "running",
    }
    const persistedA: AutomationRunApiRecord = {
      ...newerQuiet,
      id: "persisted-a",
      requestId: "request-a",
      status: "running",
    }

    expect(
      reconcileGenerationPlaceholders({
        current: [placeholderB, placeholderA],
        persisted: [persistedA],
        automationId: "automation-1",
        generating: true,
      }).map((run) => run.id)
    ).toEqual([placeholderB.id, persistedA.id])
  })

  it("exports rendered slide images with source images as a fallback", () => {
    expect(
      exportableAutomationRunSlides({
        ...newerQuiet,
        renderedSlides: [
          {
            imageUrl: " /rendered/slide-01.png ",
            sourceImageUrl: "/source/unused.jpg",
          },
          { sourceImageUrl: " /source/slide-02.jpg " },
          { imageUrl: "  " },
        ],
      })
    ).toEqual([
      { imageUrl: "/rendered/slide-01.png" },
      { imageUrl: "/source/slide-02.jpg" },
    ])
  })
})

function run(
  id: string,
  createdAt: string,
  views: number
): AutomationRunApiRecord {
  return {
    id,
    automationId: "automation-1",
    automationTitle: "Automation",
    scheduledFor: createdAt,
    createdAt,
    status: "succeeded",
    views,
  }
}
