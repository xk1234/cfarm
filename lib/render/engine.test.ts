import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  findFontFace,
  listFontFamilies,
  listFonts,
  MIME_BY_FORMAT,
  NotImplementedError,
  renderSpec,
} from "./engine"

describe("font registry", () => {
  it("covers every bundled font file exactly once", () => {
    const files = readdirSync(join(process.cwd(), "assets/fonts")).filter((f) => /\.(otf|ttf)$/.test(f))
    expect(listFonts().map((f) => f.file).sort()).toEqual(files.sort())
    expect(files).toHaveLength(22)
  })

  it("exposes families with their real weights", () => {
    expect(listFontFamilies()).toContain("Hertical Serif Regular")
    expect(findFontFace("Inter", 800)?.file).toBe("Inter-Variable.ttf")
    expect(findFontFace("Casual Human", 700)?.file).toBe("CasualHuman-Bold.otf")
    expect(findFontFace("Angelina", 700)).toBeNull()
    expect(findFontFace("Comic Sans")).toBeNull()
  })
})

describe("renderSpec", () => {
  it("is a stub until the engine lands", async () => {
    await expect(
      renderSpec(
        { version: 1, canvas: { width: 1080, height: 1920, background: "#000" }, fonts: [], slides: [] },
        { format: "png", scale: 1 }
      )
    ).rejects.toBeInstanceOf(NotImplementedError)
    expect(MIME_BY_FORMAT.webp).toBe("image/webp")
  })
})
