import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { HomeView } from "./home-view"

describe("HomeView", () => {
  it("shows the page heading and omits pagination for empty sections", () => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <HomeView
          currentUserId="user-1"
          automations={[]}
          automationsLoading={false}
          publishedPostDates={[]}
          templates={[]}
          recentRunsByAutomationId={{}}
          generatedRunsByAutomationId={{}}
          onRetryGeneratedRuns={vi.fn()}
          onCreate={vi.fn()}
          onUseTemplate={vi.fn()}
          onAutomations={vi.fn()}
          onGenerationRunRemove={vi.fn()}
        />
      </QueryClientProvider>
    )

    expect(markup).toContain("<h1")
    expect(markup).toContain(">Home</h1>")
    expect(markup).toContain("Draft outputs")
    expect(markup).toContain("Templates")
    expect(markup).toContain("Outstanding actions")
    expect(markup).toContain("max-w-[960px]")
    expect(markup).toContain("lg:row-span-2")
    expect(markup).not.toContain("Page 1 of 1")
    expect(markup).not.toContain('aria-label="Previous page"')
  })
})
