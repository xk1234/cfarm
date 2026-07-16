import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SocialAccountIconList } from "./social-account-status"

describe("social account icon list", () => {
  it("renders icon buttons with the account username on hover", () => {
    const markup = renderToStaticMarkup(
      <SocialAccountIconList
        items={[
          {
            provider: "threads",
            integrationId: "threads-1",
            name: "Threads account",
            profile: "@creatorname",
            status: "published",
          },
        ]}
      />
    )

    expect(markup).toContain("<button")
    expect(markup).toContain('title="creatorname · Published"')
    expect(markup).toContain("tabler-icon-brand-threads")
  })
})
