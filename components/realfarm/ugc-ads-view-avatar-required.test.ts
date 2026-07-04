import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("UGCAdsView avatar requirement", () => {
  it("requires an active avatar before creating a UGC ad export", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "ugc-ads-view.tsx"), "utf8")

    expect(source).toContain("Select an AI avatar before creating a UGC ad export")
    expect(source).toContain("disabled={creating || !activeAvatar}")
  })
})
