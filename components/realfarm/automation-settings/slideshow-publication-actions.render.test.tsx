import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SlideshowPublicationActions } from "./slideshow-publication-actions"
import type { AutomationRunApiRecord } from "./types"

const run: AutomationRunApiRecord = {
  id: "run-1",
  automationId: "automation-1",
  automationTitle: "Product slideshow",
  scheduledFor: "2026-08-03T12:00:00.000Z",
  status: "succeeded",
  slideshowId: "slideshow-1",
  socialStatuses: [
    {
      provider: "tiktok",
      integrationId: "tiktok-1",
      name: "TikTok",
      status: "published",
      releaseUrl: "https://www.tiktok.com/@account/video/1",
    },
  ],
  createdAt: "2026-08-03T12:00:00.000Z",
  plan: {
    title: "Product slideshow",
    caption: "Caption",
    hashtags: "#product",
    slides: [],
  },
}

describe("SlideshowPublicationActions", () => {
  it("provides publication actions as menu-ready items", () => {
    const html = renderToStaticMarkup(
      <SlideshowPublicationActions run={run} onRunChanged={() => undefined}>
        {(actions) => (
          <ul>
            {actions.map((action) => (
              <li key={action.label}>{action.label}</li>
            ))}
          </ul>
        )}
      </SlideshowPublicationActions>
    )

    expect(html).toContain("Open live post")
    expect(html).toContain("Link published post")
    expect(html).toContain("Post to social")
  })
})
