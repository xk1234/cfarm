import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("slideshow editor persistence", () => {
  it("loads, creates, exports, and deletes slideshows through the slideshow API", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "slideshow-editor.tsx"), "utf8")

    expect(source).toContain('"/api/slideshows"')
    expect(source).toContain("persistPreviewSlideshow")
    expect(source).toContain("slideshowRecordToExported")
    expect(source).toContain("showGenerationStartedToast")
    expect(source).toContain("Sample slideshow generation started! This will take 45-60 seconds.")
    expect(source).toContain('position: "bottom-center"')
    expect(source).toContain('toast.error(getApiErrorMessage(error, "Failed to generate slideshow")')
    expect(source).toContain("previewSlidesToSlideshowImages")
    expect(source).toContain("exportedSlideshowItems")
    expect(source).toContain("draftSlideshowItems")
    expect(source).toContain("duplicateDraftSlideshow")
    expect(source).toContain('fetchJsonWithTimeout(`/api/slideshows?id=${encodeURIComponent(id)}`')
    expect(source).not.toContain("setExportedSlideshows((current) => [")
  })
})
