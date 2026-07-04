import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("Collection detail image loading", () => {
  it("uses row-based load more instead of an images-per-page selector", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "collections-view.tsx"), "utf8")

    expect(source).toContain("const INITIAL_VISIBLE_ROWS = 3")
    expect(source).toContain("const LOAD_MORE_ROWS = 3")
    expect(source).toContain("visibleRows * columns")
    expect(source).toContain("setVisibleRows((current) => current + LOAD_MORE_ROWS)")
    expect(source).toContain("Load more")
    expect(source).toContain("Columns:")
    expect(source).not.toContain("imagesPerPage")
    expect(source).not.toContain("Images per page")
  })
})
