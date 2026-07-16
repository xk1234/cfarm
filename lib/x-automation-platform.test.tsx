import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { XThreadsBrandIcon } from "@/components/realfarm/x-threads-brand-icon"
import { xThreadsPlatformForDisplay } from "@/lib/x-automation-platform"

describe("X and Threads display identity", () => {
  it("prefers the run platform and preserves an automation's saved platform", () => {
    const automation = {
      platform: "threads" as const,
      handle: "Click to add account",
      socialIntegrations: [],
    }

    expect(xThreadsPlatformForDisplay(automation)).toBe("threads")
    expect(xThreadsPlatformForDisplay(automation, "x")).toBe("x")
  })

  it("renders the Threads glyph for Threads and the X glyph for X", () => {
    expect(
      renderToStaticMarkup(<XThreadsBrandIcon platform="threads" />)
    ).toContain("tabler-icon-brand-threads")
    expect(renderToStaticMarkup(<XThreadsBrandIcon platform="x" />)).toContain(
      "tabler-icon-brand-x"
    )
  })
})
