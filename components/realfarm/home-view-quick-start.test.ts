import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("HomeView quick start templates", () => {
  it("renders quick start from template props without hardcoded formats", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components", "realfarm", "home-view.tsx"),
      "utf8"
    )

    expect(source).toContain("Quick start")
    expect(source).toContain("templates: Automation[]")
    expect(source).toContain("quickStartTemplates")
    expect(source).toContain("QUICK_START_ITEMS_PER_PAGE = 6")
    expect(source).toContain("quickStartPage")
    expect(source).toContain("pagedQuickStartTemplates")
    expect(source).toContain('aria-label="Previous quick start page"')
    expect(source).toContain('aria-label="Next quick start page"')
    expect(source).toContain("QuickStartTemplateCard")
    expect(source).toContain("onUseTemplate(automation)")
    expect(source).toContain("No templates available")
    expect(source).not.toContain("templates.slice(0, 6)")
    expect(source).not.toContain("Start automating this format")
  })
})
