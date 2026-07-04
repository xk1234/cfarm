import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("generated video persistence", () => {
  it("creates Greenscreen DB records before browser rendering starts", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "greenscreen-view.tsx"), "utf8")
    const flowStart = source.indexOf("async function createGreenscreenExport()")
    const createFlow = source.slice(
      flowStart,
      source.indexOf("return (", flowStart),
    )

    expect(source).not.toContain("placeholderId")
    expect(createFlow.indexOf("createGeneratedVideoExportRecord")).toBeLessThan(createFlow.indexOf("renderAndUploadGreenscreenVideo"))
    expect(source).toContain('status: "processing"')
    expect(source).toContain("updateGeneratedVideoExportRecord")
    expect(source).toContain('status: "failed"')
  })

  it("creates UGC ad DB records before browser rendering starts", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "ugc-ads-view.tsx"), "utf8")
    const flowStart = source.indexOf("async function createUgcAdExport()")
    const createFlow = source.slice(
      flowStart,
      source.indexOf("return (", flowStart),
    )

    expect(source).not.toContain("placeholderCounterRef")
    expect(createFlow.indexOf("createGeneratedVideoExportRecord")).toBeLessThan(createFlow.indexOf("renderAndUploadUgcAdVideo"))
    expect(createFlow).toContain("previewUrl: renderedVideo.thumbnailUrl")
    expect(source).toContain('status: "processing"')
    expect(source).toContain("updateGeneratedVideoExportRecord")
    expect(source).toContain('status: "failed"')
  })

  it("lets the generated-video API create processing records directly", () => {
    const source = readFileSync(path.join(process.cwd(), "app", "api", "generated-videos", "route.ts"), "utf8")

    expect(source).toContain("payload.status")
    expect(source).toContain("requestedStatus")
    expect(source).toContain('requestedStatus ?? "queued"')
  })
})
