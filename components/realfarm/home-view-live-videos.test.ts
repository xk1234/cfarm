import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("HomeView generated videos", () => {
  it("loads generated videos as soon as the home page mounts", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components", "realfarm", "home-view.tsx"),
      "utf8"
    )

    expect(source).toContain("fetchJsonWithTimeout<{")
    expect(source).toContain("exports?: GeneratedVideoExport[]")
    expect(source).toContain('}>("/api/generated-videos"')
    expect(source).not.toContain('if (activeTab !== "videos") return')
    expect(source).toContain("void loadGeneratedVideos()")
  })
})
