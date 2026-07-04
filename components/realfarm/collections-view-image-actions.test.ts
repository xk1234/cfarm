import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("Collection image action editor", () => {
  it("keeps edit/upscale controls in a compact editor component below the image", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "image-viewer-modal.tsx"), "utf8")

    expect(source).toContain("function CollectionImageActionEditor")
    expect(source).toContain("<CollectionImageActionEditor")
    expect(source).toContain("Image action model")
    expect(source).toContain("disabled={working || (activeTool === \"edit\" && !prompt.trim())}")
    expect(source).not.toContain("absolute right-8 top-7 z-10")
  })
})
