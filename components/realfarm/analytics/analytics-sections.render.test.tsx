import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AnalyticsOverview } from "./analytics-sections"
import type { SocialIntegration } from "@/lib/social/provider-contract"

describe("AnalyticsOverview", () => {
  it("shows connected accounts once using the performance table", () => {
    const integration = {
      integration_id: "account-1",
      name: "Creator account",
      provider: "tiktok",
    } as SocialIntegration

    const markup = renderToStaticMarkup(
      <AnalyticsOverview
        integrations={[integration]}
        selectedAccountId="all"
        onSelectAccount={vi.fn()}
        onOpenPlatform={vi.fn()}
        posts={[]}
        snapshots={[]}
        followerSnapshots={[]}
        onSelectPost={vi.fn()}
      />
    )

    expect(markup.match(/>Accounts<\/h2>/g)).toHaveLength(1)
    expect(markup).not.toContain("Connected accounts")
    expect(markup).toContain("Creator account")
  })
})
