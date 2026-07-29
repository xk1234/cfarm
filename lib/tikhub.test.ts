import { describe, expect, it } from "vitest"

import {
  normalizeTikHubPosts,
  normalizeTikHubProfile,
  normalizeTikTokHandle,
} from "@/lib/tikhub"

describe("TikHub normalization", () => {
  it("accepts TikTok handles and profile URLs", () => {
    expect(normalizeTikTokHandle("@creator")).toBe("creator")
    expect(normalizeTikTokHandle("https://www.tiktok.com/@creator/video/1")).toBe(
      "creator"
    )
  })

  it("normalizes nested profile data", () => {
    expect(
      normalizeTikHubProfile(
        {
          data: {
            user: {
              uid: "42",
              sec_uid: "secure-42",
              unique_id: "creator",
              nickname: "Creator",
              avatar_thumb: { url_list: ["https://cdn.test/avatar.jpg"] },
            },
          },
        },
        "fallback"
      )
    ).toEqual({
      externalUserId: "42",
      secUserId: "secure-42",
      handle: "creator",
      displayName: "Creator",
      avatarUrl: "https://cdn.test/avatar.jpg",
    })
  })

  it("normalizes video and slideshow records", () => {
    const posts = normalizeTikHubPosts(
      {
        data: {
          aweme_list: [
            {
              aweme_id: "video-1",
              desc: "Video caption",
              create_time: 1_753_747_200,
              statistics: {
                play_count: 20_000,
                digg_count: 2_000,
                comment_count: 100,
                share_count: 50,
                collect_count: 150,
              },
              video: {
                cover: { url_list: ["https://cdn.test/cover.jpg"] },
                download_addr: {
                  url_list: ["https://cdn.test/video.mp4"],
                },
              },
            },
            {
              aweme_id: "slides-1",
              desc: "Slides caption",
              create_time: 1_753_660_800,
              statistics: { play_count: 10_000, digg_count: 500 },
              image_post_info: {
                images: [
                  {
                    display_image: {
                      url_list: ["https://cdn.test/slide-1.jpg"],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      "creator"
    )

    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({
      externalPostId: "video-1",
      mediaType: "video",
      views: 20_000,
      mediaUrl: "https://cdn.test/video.mp4",
    })
    expect(posts[1]).toMatchObject({
      externalPostId: "slides-1",
      mediaType: "slides",
      slideUrls: ["https://cdn.test/slide-1.jpg"],
    })
  })
})
