import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PostFrequencyGraph } from "@/components/realfarm/post-frequency-graph"

/**
 * Renders to static markup rather than a DOM: this project has no jsdom, and
 * the graph shipped once showing "0 posts" because nothing verified that it
 * actually drew anything.
 */
describe("PostFrequencyGraph rendering", () => {
  const dates = [
    new Date(2026, 6, 20).toISOString(),
    new Date(2026, 6, 20).toISOString(),
    new Date(2026, 6, 18).toISOString(),
  ]

  it("draws a cell per day plus the legend", () => {
    const html = renderToStaticMarkup(
      <PostFrequencyGraph dates={dates} weeks={8} />
    )
    const cells = (html.match(/rounded-\[2px\]/g) ?? []).length
    expect(cells).toBe(8 * 7 + 5)
  })

  it("uses compact mobile cells and larger desktop cells", () => {
    const html = renderToStaticMarkup(
      <PostFrequencyGraph dates={dates} weeks={8} />
    )

    expect(html).toContain("size-2 rounded-[2px] sm:size-[13px]")
    expect(html).toContain("gap-[2px] sm:gap-[4px]")
  })

  it("reports the real total, not zero", () => {
    const html = renderToStaticMarkup(
      <PostFrequencyGraph dates={dates} weeks={8} />
    )
    expect(html).toContain(">3<")
    expect(html).toContain("posts in the last")
  })

  it("renders an empty state without throwing", () => {
    const html = renderToStaticMarkup(
      <PostFrequencyGraph dates={[]} weeks={4} />
    )
    expect(html).toContain(">0<")
  })
})
