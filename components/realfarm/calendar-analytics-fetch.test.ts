import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("content calendar Postiz fetch", () => {
  it("uses a stable month range dependency instead of render-created Luxon objects", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "calendar-analytics.tsx"), "utf8")
    const fetchStart = source.indexOf("void fetchJsonWithTimeout<{ posts?: { posts?: PostizListedPost[] }; configured?: boolean }>")
    const fetchBlock = source.slice(fetchStart, source.indexOf("\n\n  return (", fetchStart))

    expect(source).toContain("monthRangeKey")
    expect(fetchBlock).toContain("}, [monthRangeKey])")
    expect(fetchBlock).not.toContain("[monthDate, monthEnd]")
  })
})
