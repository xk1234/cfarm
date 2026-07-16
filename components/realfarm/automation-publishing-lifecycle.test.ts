import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

describe("automation publishing lifecycle", () => {
  it("does not auto-publish manual button generations", () => {
    const runner = source("lib/automation-runner.ts")
    const xGenerateRoute = source("app/api/x-automations/generate/route.ts")

    expect(runner).toContain(
      'generationSource: input.force ? "manual" : "scheduled"'
    )
    expect(runner).toContain('input.claimedRun.generationSource !== "manual"')
    expect(xGenerateRoute).not.toContain("publishXAutomationRun")
  })

  it("removes warmup controls and supports marking generated posts as published", () => {
    const socialSettings = source(
      "components/realfarm/automation-settings/social-settings.tsx"
    )
    const slideshowStatus = source(
      "components/realfarm/automation-settings/run-publication-status-select.tsx"
    )
    const sharedStatus = source(
      "components/realfarm/publication-status-control.tsx"
    )
    const slideshowViewer = source(
      "components/realfarm/slideshow-viewer-modal.tsx"
    )
    const slideshowRoute = source("app/api/slideshows/[id]/route.ts")
    const videoPosting = source(
      "components/realfarm/generated-video-exports.tsx"
    )
    const videoRoute = source("app/api/generated-videos/[id]/route.ts")

    expect(socialSettings).not.toMatch(/warmup/i)
    expect(sharedStatus).toContain(
      '<option value="mark_published">Mark as published</option>'
    )
    expect(slideshowStatus).toContain("<PublicationStatusControl")
    expect(slideshowStatus).toContain(
      'JSON.stringify({ action: "markPublished" })'
    )
    expect(slideshowViewer).not.toContain("Post slideshow")
    expect(slideshowViewer).not.toContain("SlideshowPostModal")
    expect(slideshowRoute).toContain("markAutomationRunPublished")
    expect(videoPosting).not.toContain('<option value="manual_posted">')
    expect(videoPosting).toContain("GeneratedVideoPublicationStatusSelect")
    expect(videoPosting).toContain("<PublicationStatusControl")
    expect(videoRoute).toContain("markGeneratedVideoExportPublished")
  })
})
