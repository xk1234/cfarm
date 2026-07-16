import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("CollectionsView", () => {
  const source = readFileSync(
    path.join(process.cwd(), "components/realfarm/collections-view.tsx"),
    "utf8"
  )
  const workspaceSource = readFileSync(
    path.join(process.cwd(), "components/realfarm-workspace.tsx"),
    "utf8"
  )
  const globalStyles = readFileSync(
    path.join(process.cwd(), "app/globals.css"),
    "utf8"
  )

  it("uses one responsive grid instead of separately hardcoding column math", () => {
    expect(source).toContain("grid-cols-[repeat(auto-fill,minmax(150px,1fr))]")
    expect(source).not.toContain("COLLECTION_CARD_WIDTH")
    expect(source).not.toContain("COLLECTION_GRID_GAP")
    expect(source).not.toContain("collectionColumns")
    expect(source).not.toContain("ResizeObserver")
  })

  it("keeps pagination stable when switching view modes", () => {
    expect(source).toContain("const COLLECTION_PAGE_SIZE = 28")
    expect(source).toContain("current + COLLECTION_PAGE_SIZE")
    expect(source).not.toContain("visibleCollectionRows")
    expect(source).not.toContain("COLLECTION_LOAD_MORE_ROWS")
  })

  it("shows a collection-shaped loading state until persisted data loads", () => {
    expect(source).toContain("CollectionGridSkeleton")
    expect(source).toContain("CollectionTableSkeleton")
    expect(workspaceSource).toContain("collectionsLoaded")
    expect(workspaceSource).toContain("loading={!collectionsLoaded}")
  })

  it("shows a square media preview in each table row", () => {
    expect(source).toContain("previewImage: collection.images[0] ?? null")
    expect(source).toContain('className="size-9 shrink-0 rounded-md')
    expect(source).toContain(
      'className="border border-app-panel-border bg-app-surface"'
    )
  })

  it("loads the AG Grid icon font used by table controls", () => {
    expect(globalStyles).toContain(
      '@import "ag-grid-community/styles/ag-theme-quartz.css"'
    )
    expect(globalStyles).not.toContain("ag-theme-quartz-no-font.css")
  })

  it("uses the pin action as the only pinned-state indicator", () => {
    expect(source).not.toContain('headerName: "Pinned"')
    expect(source).toContain("<IconPinFilled")
  })

  it("does not inject an aggregate All Images collection", () => {
    expect(workspaceSource).not.toContain("allImagesCollectionFrom")
    expect(workspaceSource).not.toContain("allImagesCollection")
    expect(workspaceSource).not.toContain("collection-all-images")
  })
})
