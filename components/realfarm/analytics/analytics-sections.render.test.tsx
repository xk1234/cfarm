import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  AccountSelectorRail,
  RecentPosts,
} from "@/components/realfarm/analytics/analytics-sections"
import type { LatestPost } from "@/components/realfarm/analytics/analytics-selectors"
import type { SocialIntegration } from "@/lib/social/provider-contract"

const integration: SocialIntegration = {
  integration_id: "tiktok-1",
  provider: "tiktok",
  name: "Creator",
}

const post: LatestPost = {
  id: "snapshot-1",
  postId: "post-1",
  integrationId: "tiktok-1",
  provider: "tiktok",
  capturedAt: "2026-08-02T00:00:00.000Z",
  content: "A published slideshow",
  thumbnailUrl: "https://cdn.example.com/post.webp",
  metrics: { views: 469, engagementRate: 5.33 },
  latestMetric: {},
  rawMetrics: {},
  observedKeys: ["views"],
  publication: {
    id: "post-1",
    sourceType: "external",
    sourceId: "native-1",
    integrationId: "tiktok-1",
    provider: "tiktok",
    status: "published",
    linkState: "manually_linked",
    statsSources: ["tiktok_studio"],
    content: "A published slideshow",
    media: [],
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
}

describe("analytics overview sections", () => {
  it("renders recent posts as image-led cards", () => {
    const html = renderToStaticMarkup(
      <RecentPosts
        title="Recent posts"
        posts={[post]}
        integrations={[integration]}
        onSelect={vi.fn()}
      />
    )

    expect(html).toContain('src="https://cdn.example.com/post.webp"')
    expect(html).toContain("aspect-[4/5]")
    expect(html).toContain("grid-cols-2")
    expect(html).not.toContain("line-clamp-2")
  })

  it("keeps connected accounts in one compact selector", () => {
    const html = renderToStaticMarkup(
      <AccountSelectorRail
        integrations={[integration]}
        selectedIds={[integration.integration_id]}
        allSelected={false}
        multi={false}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onOpenPlatform={vi.fn()}
      />
    )

    expect(html.match(/Connected accounts/g)).toHaveLength(1)
    expect(html).toContain("Open TikTok analytics")
  })
})
