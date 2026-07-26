import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TikTokCommentApprovalQueue } from "./approval-queue"

describe("TikTokCommentApprovalQueue", () => {
  it("renders a useful empty state without a collection id", () => {
    const markup = renderToStaticMarkup(<TikTokCommentApprovalQueue />)

    expect(markup).toContain("Start from post analytics")
    expect(markup).toContain("Collect comments")
    expect(markup).toContain('href="/app/analytics"')
    expect(markup).not.toContain(
      "Open this queue with a collectionId query parameter."
    )
  })
})
