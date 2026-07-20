import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { AutomationOverviewPanel } from "./overview-panel"

describe("automation recent generation progress", () => {
  it("loads the automation overview module", () => {
    expect(AutomationOverviewPanel).toBeTypeOf("function")
  })

  it("renders the in-flight stage before considering a thumbnail", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/overview-panel.tsx"
      ),
      "utf8"
    )

    const progressBranch = source.indexOf(") : inFlight ? (")
    const thumbnailBranch = source.indexOf(
      ') : mediaKind === "video" && run.videoUrl ? ('
    )

    expect(progressBranch).toBeGreaterThan(-1)
    expect(thumbnailBranch).toBeGreaterThan(progressBranch)
    expect(source).toContain('{run.progress?.stage ?? "Generating…"}')
    expect(source).toContain('const failed = run.status === "failed"')
    expect(source).toContain("<GenerationFailurePlaceholder")
    expect(source).toContain("<RunPublicationStatusSelect")
  })

  it("uses the same three-column result grid for videos and slideshows", () => {
    const overviewSource = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/overview-panel.tsx"
      ),
      "utf8"
    )
    const videoExportsSource = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/generated-video-exports.tsx"
      ),
      "utf8"
    )
    const gridSource = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/automation-generation-grid.tsx"
      ),
      "utf8"
    )

    expect(overviewSource).not.toContain("max-w-[960px]")
    expect(
      overviewSource.match(/max-w-\[494px\]/g)?.length
    ).toBeGreaterThanOrEqual(3)
    expect(overviewSource).toContain('variant="automation"')
    expect(videoExportsSource).toContain("exports.slice(0, 3)")
    expect(videoExportsSource).toContain("<AutomationGenerationGrid>")
    expect(gridSource).toContain('"grid grid-cols-3 gap-3"')
  })

  it("keeps account icons and explicit lifecycle dates on each slideshow card", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/overview-panel.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("<SocialAccountIconList")
    expect(source).toContain('className="absolute right-2 bottom-2 z-20"')
    expect(source).toContain("Created {formatRunDate(run.createdAt)}")
    expect(source).toContain(
      'publishedAt ? formatRunDate(publishedAt) : "None"'
    )
  })
})
