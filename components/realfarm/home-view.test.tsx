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
    expect(markup).toContain("Scheduled templates")
    expect(markup).toContain("Outstanding actions")
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
        templates={[]}
        recentRunsByAutomationId={{}}
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
        onCreate={vi.fn()}
        onUseTemplate={vi.fn()}
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
