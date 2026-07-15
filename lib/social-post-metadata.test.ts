import { describe, expect, it } from "vitest"

import {
  normalizeSocialPostMetadata,
  socialPostMetadataPromptLines,
  socialPostMetadataSchemaProperties,
} from "@/lib/social-post-metadata"

describe("shared social post metadata", () => {
  it("uses the same metadata rules for every generated format", () => {
    expect(socialPostMetadataPromptLines("video")).toEqual([
      "- title: write an AI-generated title for the video, 3-8 words, specific to the hook/topic.",
      "- caption: write a short TikTok/Instagram-style post caption for the video, one sentence, specific to the hook/topic, no hashtags.",
      "- hashtags: return an array of 3-5 broad lowercase hashtags related to the topic or niche.",
    ])

    const hashtagsSchema = socialPostMetadataSchemaProperties("video").hashtags
    expect(hashtagsSchema).toMatchObject({ type: "array" })
    expect(hashtagsSchema).not.toHaveProperty("minItems")
    expect(hashtagsSchema).not.toHaveProperty("maxItems")
  })

  it("normalizes generated video and slideshow hashtags identically", () => {
    expect(
      normalizeSocialPostMetadata({
        title: "A Better Small Home",
        caption: "Useful details that make a compact room work.",
        hashtags: ["HDB", "#InteriorDesign", "#hdb", "small-spaces"],
      })
    ).toEqual({
      title: "A Better Small Home",
      caption: "Useful details that make a compact room work.",
      hashtags: ["#hdb", "#interiordesign", "#small-spaces"],
    })
  })

  it("keeps every generated hashtag instead of enforcing a count", () => {
    expect(
      normalizeSocialPostMetadata({
        title: "A Better Small Home",
        caption: "Useful details that make a compact room work.",
        hashtags: ["one", "two", "three", "four", "five", "six"],
      }).hashtags
    ).toEqual(["#one", "#two", "#three", "#four", "#five", "#six"])
  })
})
