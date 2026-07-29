import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { HomeView } from "./home-view"

describe("HomeView", () => {
  it("shows the page heading and omits pagination for empty sections", () => {
    const markup = renderToStaticMarkup(
      <HomeView
        currentUserId="user-1"
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
    )

    expect(markup).toContain("<h1")
    expect(markup).toContain(">Home</h1>")
    expect(markup).not.toContain("Page 1 of 1")
    expect(markup).not.toContain('aria-label="Previous page"')
  })
})
