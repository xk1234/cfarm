import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { PostAnalyticsPage } from "@/components/realfarm/analytics/post-analytics-page"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"
import type { SocialIntegration } from "@/lib/social/provider-contract"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}))

const integration: SocialIntegration = {
  integration_id: "tiktok-1",
  provider: "tiktok",
  name: "Creator",
}

const snapshot: PostFastMetricSnapshot = {
  id: "snapshot-1",
  postId: "post-1",
  platformPostId: "7669076017918561554",
  integrationId: integration.integration_id,
  provider: "tiktok",
  capturedAt: "2026-08-02T00:00:00.000Z",
  publishedAt: "2026-08-01T00:00:00.000Z",
  content: "A published slideshow",
  metrics: { views: 469, engagementRate: 5.33 },
  latestMetric: {},
  rawMetrics: {},
  observedKeys: ["views", "engagementRate"],
}

describe("PostAnalyticsPage actions", () => {
  it("keeps account and comment actions off a post-specific analytics page", () => {
    const html = renderToStaticMarkup(
      <PostAnalyticsPage
        snapshots={[snapshot]}
        integration={integration}
        contentType="slideshow"
      />
    )

    expect(html).not.toContain("Import from TikTok Studio")
    expect(html).not.toContain("Collect in extension")
    expect(html).not.toContain("Sync this account")
    expect(html).toContain("TikTok Studio analytics")
    expect(html).toContain("Import analytics")
  })
})
