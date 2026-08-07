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
        generatedRunsByAutomationId={{}}
        onRetryGeneratedRuns={vi.fn()}
        onAutomations={vi.fn()}
        onGenerationRunRemove={vi.fn()}
      />
    )

    expect(markup).toContain("<h1")
    expect(markup).toContain(">Home</h1>")
    expect(markup).toContain("Saved templates")
    expect(markup).toContain("Recent generations")
    expect(markup).toContain("Outstanding actions")
    expect(markup).not.toContain("New template")
    expect(markup).not.toContain("Start from a proven workflow")
    expect(markup).not.toContain("Page 1 of 1")
    expect(markup).not.toContain('aria-label="Previous page"')
  })

  it("renders recent slideshows with the dashboard run card", () => {
    const markup = renderToStaticMarkup(
      <HomeView
        currentUserId="user-1"
        automations={[]}
        automationsLoading={false}
        publishedPostDates={[]}
        generatedRunsByAutomationId={{
          "automation-1": [
            {
              ownerId: "user-1",
              id: "run-1",
              automationTitle: "Recent run",
              status: "succeeded",
              createdAt: "2026-08-02T00:00:00.000Z",
              renderedSlides: [
                {
                  id: "slide-1",
                  imageUrl: "/generated/recent-run.png",
                  text: "A recent slide",
                },
              ],
            },
          ],
        }}
        onRetryGeneratedRuns={vi.fn()}
        onAutomations={vi.fn()}
        onGenerationRunRemove={vi.fn()}
      />
    )

    expect(markup).toContain(
      'aria-label="Open generated slideshow A recent slide"'
    )
    expect(markup).toContain("Not published")
    expect(markup).toContain("Published None")
  })
})
