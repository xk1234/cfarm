import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("automation template categories", () => {
  it("groups X and Threads under Other social media", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/realfarm/templates.tsx"),
      "utf8"
    )

    expect(source).toContain(
      'if (kind === "x_threads") return "Other social media"'
    )
    expect(source).toContain(
      'if (automation.automationKind === "x_threads") return "x_threads"'
    )
    expect(source).toContain('onCreateBlank("x_threads", "x")')
    expect(source).toContain('onCreateBlank("x_threads", "threads")')
    expect(source).not.toContain('? "X / Threads"')
  })
})
