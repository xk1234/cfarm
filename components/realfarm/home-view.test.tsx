import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { HomeView } from "./home-view"

describe("HomeView", () => {
  it("shows the page heading, render metrics and omits empty pagination", () => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <HomeView onOpenSchedule={vi.fn()} onOpenCollections={vi.fn()} />
      </QueryClientProvider>
    )

    expect(markup).toContain("<h1")
    expect(markup).toContain(">Home</h1>")
    expect(markup).toContain(">Renders</h2>")
    expect(markup).toContain("Outstanding actions")
    expect(markup).not.toContain("Templates")
    expect(markup).not.toContain("Videos")
    expect(markup).not.toContain("Page 1 of 1")
    expect(markup).not.toContain('aria-label="Previous page"')
  })
})
