import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ResponsiveActions,
  ResponsiveGrid,
  ResponsivePage,
  ResponsivePageHeader,
} from "@/components/ui/responsive-layout"

describe("responsive layout primitives", () => {
  it("establishes a named page container and fluid width", () => {
    const markup = renderToStaticMarkup(
      <ResponsivePage width="canvas">Content</ResponsivePage>
    )

    expect(markup).toContain("@container/page")
    expect(markup).toContain("w-full")
    expect(markup).toContain("max-w-[1380px]")
  })

  it("keeps header actions in the shared responsive action region", () => {
    const markup = renderToStaticMarkup(
      <ResponsivePageHeader
        title="Collections"
        actions={<button type="button">Import</button>}
      />
    )

    expect(markup).toContain('data-slot="responsive-page-header"')
    expect(markup).toContain('data-slot="responsive-actions"')
    expect(markup).toContain("@md/page:grid-cols")
  })

  it("uses content-sized grids instead of fixed viewport column counts", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveGrid min="small">
        <div>One</div>
        <div>Two</div>
      </ResponsiveGrid>
    )

    expect(markup).toContain("auto-fit")
    expect(markup).toContain("min(100%")
  })

  it("allows action groups to wrap without overflowing the page", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveActions>
        <button type="button">One</button>
        <button type="button">Two</button>
      </ResponsiveActions>
    )

    expect(markup).toContain("flex-wrap")
    expect(markup).toContain("min-w-0")
  })
})
