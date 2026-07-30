import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MarketingNav } from "@/components/marketing/marketing-shell"
import { MobileNavigation } from "@/components/realfarm/navigation"

describe("mobile navigation", () => {
  it("keeps the company identity and hamburger in the workspace header", () => {
    const markup = renderToStaticMarkup(<MobileNavigation view="analytics" />)

    expect(markup.match(/>LumenClip</g)).toHaveLength(1)
    expect(markup).toContain('aria-label="Open menu"')
    expect(markup).toContain('aria-controls="mobile-nav-menu"')
    expect(markup).not.toContain(">Analytics<")
  })

  it("uses the same company identity and hamburger pattern on marketing pages", () => {
    const markup = renderToStaticMarkup(<MarketingNav />)

    expect(markup.match(/>LumenClip</g)).toHaveLength(1)
    expect(markup).toContain('aria-label="Open menu"')
    expect(markup).toContain('aria-controls="marketing-mobile-menu"')
  })
})
