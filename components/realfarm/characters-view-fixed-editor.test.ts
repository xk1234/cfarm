import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("CharactersView fixed prompt editor layout", () => {
  it("keeps the prompt editor fixed while generated images scroll behind it", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "characters-view.tsx"), "utf8")

    expect(source).toContain('className="relative h-[calc(100svh-72px)] overflow-hidden bg-[#f8f8f4] px-7 py-6"')
    expect(source).toContain('className={cn("absolute inset-x-0 bottom-0 top-[104px] overflow-y-auto px-7 pb-64 pt-8"')
    expect(source).toContain('className="absolute inset-x-8 bottom-6 z-30 mx-auto max-w-[760px] rounded-[16px] bg-white p-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)]"')
  })
})
