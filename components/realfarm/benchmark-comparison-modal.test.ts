import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { BenchmarkComparisonModal } from "./benchmark-comparison-modal"

describe("benchmark comparison explanations", () => {
  it("loads the modal and renders model rationales with cache policy", () => {
    expect(BenchmarkComparisonModal).toBeTypeOf("function")

    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/benchmark-comparison-modal.tsx"
      ),
      "utf8"
    )
    expect(source).toContain("rationale={row.rationales.hookVirality}")
    expect(source).toContain("rendered pixels, rubric, and model are unchanged")
    expect(source).toContain("The grader did not return an explanation.")
  })
})
