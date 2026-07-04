import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("analytics table", () => {
  it("uses AG Grid with real metric rows instead of hardcoded grid markup", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "calendar-analytics.tsx"), "utf8")

    expect(source).toContain("AgGridReact<AnalyticsMetricRow>")
    expect(source).toContain("analyticsRows")
    expect(source).toContain("analyticsMetricRow")
    expect(source).not.toContain('["Account", "Views", "Likes", "Comments", "Shares", "Engagement Rate", "Created"]')
    expect(source).not.toContain('grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1.2fr_1fr]')
    expect(source).not.toContain('>Table</Button>')
    expect(source).not.toContain('>Grid</Button>')
  })
})
