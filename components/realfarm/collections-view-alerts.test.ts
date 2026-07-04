import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("CollectionsView API alerts", () => {
  it("shows image edit and upscale API failures through the floating toast layer", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "image-viewer-modal.tsx"), "utf8")
    const imageActionBlock = source.slice(
      source.indexOf("async function runImageAction()"),
      source.indexOf("return (", source.indexOf("async function runImageAction()"))
    )

    expect(source).toContain('import { toast } from "sonner"')
    expect(source).toContain('import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"')
    expect(imageActionBlock).toContain("fetchJsonWithTimeout")
    expect(imageActionBlock).toContain("toast.error")
    expect(imageActionBlock).toContain("getApiErrorMessage")
  })
})
