import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("GeneratedVideoExports actions", () => {
  it("renders save, schedule, and delete controls with scheduling backed by Postiz", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-exports.tsx"), "utf8")

    expect(source).toContain("IconDownload")
    expect(source).toContain("IconCalendar")
    expect(source).toContain("IconTrash")
    expect(source).toContain('aria-label="Save video"')
    expect(source).toContain('aria-label="Schedule post"')
    expect(source).toContain('aria-label="Delete output"')
    expect(source).toContain("poster={item.previewUrl}")
    expect(source).toContain("primeVideoThumbnail")
    expect(source).toContain("ScheduleGeneratedVideoModal")
    expect(source).toContain('"/api/postiz/integrations"')
    expect(source).toContain('"/api/postiz/upload"')
    expect(source).toContain('"/api/postiz/posts"')
    expect(source).toContain("datetime-local")
    expect(source).toContain("/api/generated-videos?id=")
  })
})
