import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("swipes filter layout", () => {
  it("keeps all dropdown filters on one horizontally scrollable row", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/realfarm/swipes-view.tsx"),
      "utf8"
    )

    expect(source).toContain('aria-label="Swipe filters"')
    expect(source).toContain("flex flex-nowrap items-center")
    expect(source).toContain("overflow-x-auto")
    expect(source).toContain('className="shrink-0"')
  })
})
