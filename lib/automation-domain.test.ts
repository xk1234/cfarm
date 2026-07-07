import { describe, expect, it } from "vitest"

import {
  automationRunToResult,
  normalizeDomainRunStatus,
} from "@/lib/automation-domain"

type AutomationRunResultInput = Parameters<typeof automationRunToResult>[0]

describe("automation domain adapters", () => {
  it("normalizes legacy run states away from drafts", () => {
    expect(normalizeDomainRunStatus("draft")).toBe("succeeded")
    expect(normalizeDomainRunStatus("scheduled")).toBe("succeeded")
    expect(normalizeDomainRunStatus("succeeded")).toBe("succeeded")
    expect(normalizeDomainRunStatus("failed")).toBe("failed")
  })

  it("creates results only from successful automation runs with outputs", () => {
    const result = automationRunToResult({
      id: "automation-run-1",
      automationId: "automation-1",
      automationTitle: "Daily hooks",
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "succeeded",
      slideshowId: "slideshow-1",
      videoUrl: "/api/local-assets/slideshows/outputs/slideshow-1/result.mp4",
      thumbnailUrl:
        "/api/local-assets/slideshows/outputs/slideshow-1/thumbnail.png",
      outputImages: [
        "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
      ],
      outputDir: "/api/local-assets/slideshows/outputs/slideshow-1",
      plan: {
        title: "Generated Study Tips",
        caption: "Try these study habits.",
        hashtags: "#study",
        hook: "Study smarter",
        imageCollectionIds: ["collection-1"],
        slides: [],
        slideCount: { mode: "static", count: 1 },
        publishType: "slideshow",
        autoMusic: true,
        autoPost: false,
        language: "English",
      },
      createdAt: "2026-07-03T15:00:01.000Z",
      updatedAt: "2026-07-03T15:00:02.000Z",
    })

    expect(result).toEqual({
      id: "result-automation-run-1",
      automationId: "automation-1",
      runId: "automation-run-1",
      workflowType: "slideshow",
      title: "Generated Study Tips",
      status: "succeeded",
      createdAt: "2026-07-03T15:00:02.000Z",
      updatedAt: "2026-07-03T15:00:02.000Z",
      artifacts: {
        slideshowId: "slideshow-1",
        videoUrl:
          "/api/local-assets/slideshows/outputs/slideshow-1/result.mp4",
        thumbnailUrl:
          "/api/local-assets/slideshows/outputs/slideshow-1/thumbnail.png",
        outputImages: [
          "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png",
        ],
        outputDir: "/api/local-assets/slideshows/outputs/slideshow-1",
      },
      destinationAccountIds: [],
    })
  })

  it("does not create a result for failed or output-less runs", () => {
    const baseRun: AutomationRunResultInput = {
      id: "automation-run-1",
      automationId: "automation-1",
      automationTitle: "Daily hooks",
      scheduledFor: "2026-07-03T15:00:00.000Z",
      status: "failed",
      plan: {
        title: "Generated Study Tips",
        caption: "",
        hashtags: "",
        hook: "Study smarter",
        imageCollectionIds: [],
        slides: [],
        slideCount: { mode: "static", count: 1 },
        publishType: "slideshow",
        autoMusic: true,
        autoPost: false,
        language: "English",
      },
      createdAt: "2026-07-03T15:00:01.000Z",
      updatedAt: "2026-07-03T15:00:02.000Z",
    }

    expect(automationRunToResult(baseRun)).toBeNull()
    expect(
      automationRunToResult({ ...baseRun, status: "succeeded" })
    ).toBeNull()
  })
})
