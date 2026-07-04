import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("slideshow format picker modal", () => {
  it("is only a user automation selector", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "realfarm",
        "slideshow-format-modal.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("Select automation")
    expect(source).toContain("Choose from your own automations.")
    expect(source).toContain("No automations available")
    expect(source).toContain("automationConfigs")
    expect(source).toContain("TemplateGeneratedPreview")
    expect(source).toContain("recentRunsByAutomationId")
    expect(source).toContain("generatedExampleSlides")
    expect(source).not.toContain("templatePreviewImages")
    expect(source).not.toContain("automationCollectionIds")
    expect(source).not.toContain("FormatLabeledSelect")
    expect(source).not.toContain("FormatPreviewCard")
    expect(source).not.toContain("md:grid-cols-[340px_1fr]")
    expect(source).not.toContain("+ Add text")
    expect(source).not.toContain("Start from template")
    expect(source).not.toContain("Select template")
  })
})
