import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("slide testing center model tags", () => {
  it("renders the model id as a small tag on each output preview", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components", "temp", "slide-testing-center.tsx"),
      "utf8"
    )
    const runResultSource = source.slice(
      source.indexOf("function RunResult("),
      source.indexOf("function SlidePreview(")
    )

    expect(runResultSource).toContain("{run.model}")
    expect(runResultSource).toContain("Model")
    expect(runResultSource).toContain("absolute")
  })
})
