import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("standard collection selector", () => {
  it("provides a reusable modal picker with Pinterest import and no community tab", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "collection-selector.tsx"), "utf8")
    const closedSelectorSource = source.slice(source.indexOf("return ("), source.indexOf("{open &&"))

    expect(source).toContain("export function CollectionSelector")
    expect(source).toContain("PinterestCollectionSearch")
    expect(source).toContain("showPinterestSearch")
    expect(source).toContain("onCreateCollection")
    expect(source).toContain("Select collection")
    expect(source).toContain("Search collections")
    expect(source).toContain("Add collection")
    expect(source).not.toContain("Community")
    expect(source).not.toContain("My Collections")
    expect(closedSelectorSource).toContain("ChevronRight")
    expect(closedSelectorSource).toContain("onClick={() => setOpen(true)}")
    expect(closedSelectorSource).not.toContain("<Button")
    expect(closedSelectorSource).not.toContain("setShowPinterestSearch(true)")
  })

  it("uses the standard selector in slideshow format settings", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "automation-settings.tsx"), "utf8")

    expect(source).toContain('import { CollectionSelector } from "@/components/realfarm/collection-selector"')
    expect(source).toContain("<CollectionSelector")
    expect(source).toContain("onCreateCollection={onCreateCollection}")
    expect(source).not.toContain("function AutomationCollectionPicker")
    expect(source).not.toContain("<AutomationCollectionPicker")
  })
})
