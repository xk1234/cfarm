import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AnalyticsOverview, RecentPosts } from "./analytics-sections"
import type { LatestPost } from "./analytics-selectors"
import type { SocialIntegration } from "@/lib/social/provider-contract"

describe("AnalyticsOverview", () => {
  it("starts with portfolio metrics instead of a redundant accounts table", () => {
    const integration = {
      integration_id: "account-1",
      name: "Creator account",
      provider: "tiktok",
    } as SocialIntegration

    const markup = renderToStaticMarkup(
      <AnalyticsOverview
        integrations={[integration]}
        posts={[]}
        snapshots={[]}
        followerSnapshots={[]}
        slideshowPreviews={{}}
        onSelectPost={vi.fn()}
      />
    )

    expect(markup).not.toContain(">Accounts</h2>")
    expect(markup).not.toContain("Creator account")
    expect(markup).toContain("Total audience")
  })

  it("shows TikTok views in the portfolio total instead of blank impressions", () => {
    const integration = {
      integration_id: "account-1",
      name: "Creator account",
      provider: "tiktok",
    } as SocialIntegration
    const post = {
      id: "snapshot-1",
      postId: "post-1",
      integrationId: "account-1",
      provider: "tiktok",
      capturedAt: "2026-08-07T00:00:00.000Z",
      metrics: { views: 35_905, interactions: 2_803 },
      latestMetric: {},
      rawMetrics: {},
      observedKeys: ["views", "interactions"],
    } as LatestPost

    const markup = renderToStaticMarkup(
      <AnalyticsOverview
        integrations={[integration]}
        posts={[post]}
        snapshots={[post]}
        followerSnapshots={[]}
        slideshowPreviews={{}}
        onSelectPost={vi.fn()}
      />
    )

    expect(markup).toContain("Total views")
    expect(markup).toContain("35.9K")
    expect(markup).toContain("1 of 1 posts report views")
    expect(markup).not.toContain("Total impressions")
  })

  it("renders the persisted first slide instead of a text placeholder card", () => {
    const integration = {
      integration_id: "account-1",
      name: "Creator account",
      provider: "tiktok",
    } as SocialIntegration
    const post = {
      id: "snapshot-1",
      postId: "publication-1",
      integrationId: "account-1",
      provider: "tiktok",
      capturedAt: "2026-08-07T00:00:00.000Z",
      content: "Text that should not become the preview",
      sourceType: "slideshow",
      metrics: { views: 10 },
      latestMetric: {},
      rawMetrics: {},
      observedKeys: ["views"],
    } as LatestPost

    const markup = renderToStaticMarkup(
      <RecentPosts
        title="Recent posts across platforms"
        integrations={[integration]}
        posts={[post]}
        slideshowPreviews={{
          "publication-1": ["/slides/one.png", "/slides/two.png"],
        }}
        onSelect={vi.fn()}
      />
    )

    expect(markup).toContain('src="/slides/one.png"')
    expect(markup).toContain("First slide from the published slideshow")
    expect(markup).toContain("1 / 2")
    expect(markup).not.toContain("Text that should not become the preview")
  })
})
