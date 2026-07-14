import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { LocalAsset } from "@/lib/realfarm-data"

import { DemoVideoSelector } from "./demo-video-selector"

const videos: LocalAsset[] = [
  {
    id: "natal-chart",
    name: "Natal chart walkthrough",
    path: "/tmp/natal-chart.mp4",
    url: "/api/assets/natal-chart.mp4",
    kind: "video",
  },
  {
    id: "compatibility",
    name: "Compatibility report",
    path: "/tmp/compatibility.mp4",
    url: "/api/assets/compatibility.mp4",
    kind: "video",
  },
]

describe("DemoVideoSelector", () => {
  it("renders actual video choices and exposes the selected item", () => {
    const html = renderToStaticMarkup(
      <DemoVideoSelector
        videos={videos}
        value="natal-chart"
        onChange={vi.fn()}
      />
    )

    expect(html).toContain("Natal chart walkthrough")
    expect(html).toContain("Compatibility report")
    expect(html).toContain('src="/api/assets/natal-chart.mp4"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
  })

  it("renders an explicit empty state", () => {
    const html = renderToStaticMarkup(
      <DemoVideoSelector videos={[]} value="" onChange={vi.fn()} />
    )

    expect(html).toContain("No demo videos uploaded")
  })
})
