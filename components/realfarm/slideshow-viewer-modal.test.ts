import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("SlideshowViewerModal", () => {
  it("shows the generated slide image without adding duplicate styled text", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/slideshow-viewer-modal.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("src={slide.imageUrl}")
    expect(source).not.toContain("text-yellow-100")
    expect(source).not.toContain('slide.section !== "hook"')
    expect(source).not.toContain("absolute inset-0 bg-black/20")
    expect(source).not.toContain("CheckedDropdownButton")
    expect(source).toContain("Export PNGs")
    expect(source).toContain("exportSlideshowAsPngZip")
    expect(source).toContain('label="Copy title"')
    expect(source).toContain('label="Copy description and hashtags"')
    expect(source).toContain('.join("\\n\\n")')
    expect(source).toContain("navigator.clipboard.writeText(value)")
  })

  it("lets a user replace one slide image without exposing text editing", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/slideshow-viewer-modal.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("Edit picture")
    expect(source).toContain("Choose a replacement image")
    expect(source).toMatch(/Text and layout stay\s+unchanged\./)
    expect(source).toContain("onReplaceSlideImage")
    expect(source).toContain("usedInSlideIndexes")
    expect(source).toContain("Already used")
  })

  it("keeps metadata and essential slideshow information in one panel", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/slideshow-viewer-modal.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("SlideshowInformationPanel")
    expect(source).toContain("Publishing details")
    expect(source).toContain("Save changes")
    expect(source).toContain("onUpdateMetadata")
    expect(source).toContain("Description")
    expect(source).toContain("Hashtags")
    expect(source).toContain('label="Creation date"')
    expect(source).toContain('label="Post date"')
    expect(source).toContain('label="Language"')
    expect(source).not.toContain('label="Duration"')
    expect(source).not.toContain('label="Slides"')
    expect(source).not.toContain('label="Current slide"')
    expect(source).not.toContain('label="Format"')
    expect(source).not.toContain("Run details")
    expect(source).not.toContain("<aside")
  })

  it("keeps metadata fields inside the editor boundary", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/slideshow-viewer-modal.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("overflow-x-hidden overflow-y-auto")
    expect(source).toContain("divide-y divide-[#deddd7]")
    expect(source).toContain("Description + hashtags")
  })

  it("keeps every available slideshow action visible in the header", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/slideshow-viewer-modal.tsx"
      ),
      "utf8"
    )
    const generatedViewerSource = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/generated-slideshow-viewer.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("h-[min(880px,94vh)] max-w-[1180px]")
    expect(source).toContain("px-8 py-7 sm:px-10")
    expect(source).toContain("h-[clamp(300px,52vh,460px)]")
    expect(source).not.toContain("ViewerActionsMenu")
    expect(source).not.toContain("More slideshow actions")
    expect(source).toContain("{publicationStatusControl}")
    expect(source).not.toContain('aria-label="Post or schedule"')
    expect(source).toContain('aria-label="Generation debug"')
    expect(source).toContain('aria-label="Delete slideshow"')
    expect(source).toContain('benchmarkLoading ? "Generating benchmark"')
    expect(source).toContain("IconLoader2")
    expect(source).not.toContain("canDebug")
    expect(source).toContain("Delete slideshow")
    expect(generatedViewerSource).toContain(
      "details ?? viewerDetailsForRun(run)"
    )
  })

  it("uses the automation slideshow viewer for generated homepage runs", () => {
    const homeSource = readFileSync(
      path.join(process.cwd(), "components/realfarm/home-view.tsx"),
      "utf8"
    )

    expect(homeSource).toContain("GeneratedSlideshowViewerModal")
    expect(homeSource).toContain("selectedGeneratedRun")
    expect(homeSource).toContain(
      "run={selectedGeneratedRun as AutomationRunApiRecord}"
    )
  })
})
