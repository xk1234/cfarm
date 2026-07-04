import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("CharacterCreateModal headshot loading state", () => {
  it("renders the generating headshot state inside the portrait frame", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "character-create.tsx"), "utf8")
    const loadingTextIndex = source.indexOf("Generating headshot...")
    const separateBelowPortraitIndex = source.indexOf("mt-3 rounded-[10px] bg-white px-3 py-2 text-center text-[13px] font-bold text-[#555] shadow-sm")
    const portraitContainerIndex = source.indexOf("<div className=\"relative w-fit\">")

    expect(loadingTextIndex).toBeGreaterThan(portraitContainerIndex)
    expect(source).toContain("absolute inset-0")
    expect(separateBelowPortraitIndex).toBe(-1)
  })
})
