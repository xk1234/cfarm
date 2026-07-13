import { describe, expect, it } from "vitest"

import { randomBenchmarkReferences } from "@/lib/slideshow-benchmarks"

describe("slideshow benchmarks", () => {
  it("selects unique random reference slideshows", () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      id: `reference-${index}`,
    }))
    const selected = randomBenchmarkReferences(
      records as never,
      3,
      () => 0
    )

    expect(selected.map((item) => item.id)).toEqual([
      "reference-0",
      "reference-1",
      "reference-2",
    ])
    expect(new Set(selected.map((item) => item.id)).size).toBe(3)
  })
})
