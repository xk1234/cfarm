import { describe, expect, it } from "vitest"

import { publicationLinkState } from "@/lib/publication-link-state"

describe("publicationLinkState", () => {
  it.each([
    ["postfast_published", "PostFast linked"],
    ["manually_linked", "Manually linked"],
    ["unlinked", "Unlinked"],
  ] as const)("describes %s", (state, label) => {
    expect(
      publicationLinkState({ linkState: state, statsSources: [] })
    ).toEqual(expect.objectContaining({ state, label }))
  })

  it("reports API and TikTok Studio stats independently", () => {
    expect(
      publicationLinkState({
        linkState: "postfast_published",
        statsSources: ["postfast", "tiktok_studio"],
      })
    ).toMatchObject({ hasApiStats: true, hasStudioStats: true })
    expect(
      publicationLinkState({
        linkState: "manually_linked",
        statsSources: ["tiktok_studio"],
      })
    ).toMatchObject({ hasApiStats: false, hasStudioStats: true })
  })

  it("treats a record with no linkState as unlinked", () => {
    expect(publicationLinkState({})).toMatchObject({
      state: "unlinked",
      hasApiStats: false,
      hasStudioStats: false,
    })
  })
})
