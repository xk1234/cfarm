import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { HomeView } from "./home-view"

describe("HomeView", () => {
  it("shows the page heading and omits pagination for empty sections", () => {
    const markup = renderToStaticMarkup(
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
    )

    expect(markup).toContain("<h1")
    expect(markup).toContain(">Home</h1>")
    expect(markup).toContain("Next expected post")
    expect(markup).toContain("Nothing scheduled")
    expect(markup).toContain("Active automations")
    expect(markup).toContain("Outstanding actions")
    expect(markup).not.toContain("Page 1 of 1")
    expect(markup).not.toContain('aria-label="Previous page"')
  })
})
