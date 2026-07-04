import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("CharacterAssetsPanel display", () => {
  const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "characters-view.tsx"), "utf8")

  it("renders outfits and backgrounds as square image grids with hover captions", () => {
    expect(source).toContain('const showImageOnlyGrid = activeTab === "outfits" || activeTab === "background"')
    expect(source).toContain("function AssetImageGrid")
    expect(source).toContain("function AssetImageTile")
    expect(source).toContain("grid grid-cols-3 gap-2")
    expect(source).toContain("aspect-square")
    expect(source).toContain("group-hover:opacity-100")
    expect(source).toContain("group-focus-visible:opacity-100")
  })

  it("keeps source labels out of the image-only grid tiles", () => {
    const gridStart = source.indexOf("function AssetImageTile")
    const listStart = source.indexOf("function AssetThumb")
    const gridSource = source.slice(gridStart, listStart)

    expect(gridSource).toContain("const caption = asset.caption || asset.prompt || asset.name || \"No caption yet\"")
    expect(gridSource).not.toContain("asset.source")
    expect(gridSource).not.toContain("replace")
  })
})
