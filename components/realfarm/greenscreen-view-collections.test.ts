import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("Greenscreen background collection selection", () => {
  it("uses selectable image collections instead of a fixed background image list", () => {
    const greenscreenSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "greenscreen-view.tsx"), "utf8")
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")

    expect(greenscreenSource).toContain("collections: CreatedImageCollection[]")
    expect(greenscreenSource).toContain("selectedBackgroundCollectionId")
    expect(greenscreenSource).toContain('import { CollectionSelector } from "@/components/realfarm/collection-selector"')
    expect(greenscreenSource).toContain("<CollectionSelector")
    expect(greenscreenSource).toContain("onCreateCollection")
    expect(greenscreenSource).not.toContain("SelectControl")
    expect(greenscreenSource).not.toContain('aria-label="Background image collection"')
    expect(greenscreenSource).not.toContain("backgrounds: PinterestSearchResult[]")
    expect(workspaceSource).toContain("collections={visibleCollections}")
    expect(workspaceSource).toContain("onCreateCollection={(collection) =>")
    expect(workspaceSource).not.toContain("backgrounds={backgroundCollection?.images")
  })
})
