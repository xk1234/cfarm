import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@clerk/nextjs", () => ({
  Show: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

import { MarketingNav } from "@/components/marketing/marketing-shell"
import { MobileNavigation } from "@/components/realfarm/navigation"

describe("mobile navigation", () => {
  it("keeps the company identity and hamburger in the workspace header", () => {
    const markup = renderToStaticMarkup(<MobileNavigation view="analytics" />)

    expect(markup.match(/>LumenClip</g)).toHaveLength(1)
    expect(markup).toContain('aria-label="Open menu"')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain(">Analytics<")
  })

  it("uses the same company identity and hamburger pattern on marketing pages", () => {
    const markup = renderToStaticMarkup(<MarketingNav />)

    expect(markup.match(/>LumenClip</g)).toHaveLength(1)
    expect(markup).toContain('aria-label="Open menu"')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('aria-expanded="false"')
  })
})
