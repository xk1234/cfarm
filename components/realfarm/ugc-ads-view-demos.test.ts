import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("UGCAdsView demo picker", () => {
  it("opens the plus demo control into a split My Demos and Upload modal backed by demo video assets", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "ugc-ads-view.tsx"), "utf8")

    expect(source).toContain("DemoPickerModal")
    expect(source).toContain('aria-label="Add demo"')
    expect(source).toContain('"/api/assets?scope=ugc_demo&kind=video"')
    expect(source).toContain("My Demos")
    expect(source).toContain("Upload")
    expect(source).toContain("UploadDropzone")
    expect(source).toContain('formData.set("scope", "ugc_demo")')
    expect(source).not.toContain("Demo name")
  })
})
