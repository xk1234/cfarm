import { describe, expect, it } from "vitest"

import {
  classifyTikTokContext,
  commentReviewMatchesPost,
  companionConnectUrl,
} from "../browser-extension/popup-context.js"

describe("classifyTikTokContext", () => {
  it("shows analytics collection on TikTok Studio content", () => {
    expect(
      classifyTikTokContext("https://www.tiktok.com/tiktokstudio/content")
    ).toMatchObject({ kind: "studio", feature: "studio" })
  })

  it("keeps Studio analytics reports in analytics collection mode", () => {
    expect(
      classifyTikTokContext(
        "https://www.tiktok.com/tiktokstudio/analytics/overview"
      )
    ).toMatchObject({ kind: "studio", feature: "studio" })
  })

  it("shows comments only on one exact TikTok video or slideshow", () => {
    expect(
      classifyTikTokContext(
        "https://www.tiktok.com/@horoiq/video/7669076017918561554"
      )
    ).toMatchObject({
      kind: "post",
      feature: "comments",
      handle: "horoiq",
      platformPostId: "7669076017918561554",
    })
    expect(
      classifyTikTokContext("https://www.tiktok.com/@horoiq")
    ).toMatchObject({ kind: "unsupported", feature: null })
    expect(
      classifyTikTokContext(
        "https://www.tiktok.com/@horoiq/photo/7669076017918561554?image_index=2"
      )
    ).toMatchObject({
      kind: "post",
      feature: "comments",
      platformPostId: "7669076017918561554",
    })
  })
})

describe("companionConnectUrl", () => {
  it("preserves the source task in the LumenClip deep link", () => {
    const context = classifyTikTokContext(
      "https://www.tiktok.com/@horoiq/video/7669076017918561554"
    )
    const url = new URL(companionConnectUrl("https://lumenclip.test", context))

    expect(url.pathname).toBe("/app/analytics")
    expect(url.searchParams.get("companion")).toBe("tiktok-comments")
    expect(url.searchParams.get("platformPostId")).toBe("7669076017918561554")
  })
})

describe("commentReviewMatchesPost", () => {
  it("does not show another video's paired review", () => {
    const review = {
      collection: {
        posts: [
          {
            platformPostId: "111",
            url: "https://www.tiktok.com/@creator/photo/111",
          },
        ],
      },
    }

    expect(commentReviewMatchesPost(review, "111")).toBe(true)
    expect(commentReviewMatchesPost(review, "222")).toBe(false)
  })
})
