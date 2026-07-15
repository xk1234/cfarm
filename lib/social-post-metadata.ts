import { clean, isRecord } from "@/lib/guards"

export type GeneratedSocialPostMetadata = {
  title: string
  caption: string
  hashtags: string[]
}

export function socialPostMetadataPromptLines(subject: string) {
  return [
    `- title: write an AI-generated title for the ${subject}, 3-8 words, specific to the hook/topic.`,
    `- caption: write a short TikTok/Instagram-style post caption for the ${subject}, one sentence, specific to the hook/topic, no hashtags.`,
    "- hashtags: return an array of 3-5 broad lowercase hashtags related to the topic or niche.",
  ]
}

export function socialPostMetadataSchemaProperties(subject: string) {
  return {
    title: {
      type: "string",
      minLength: 1,
      description: `AI-generated ${subject} title, 3-8 words, specific to the hook/topic.`,
    },
    caption: {
      type: "string",
      minLength: 1,
      description: `Short TikTok/Instagram-style post caption for the ${subject}, one sentence, specific to the hook/topic, no hashtags.`,
    },
    hashtags: {
      type: "array",
      items: {
        type: "string",
        minLength: 2,
        pattern: "^#[a-z0-9][a-z0-9_-]*$",
      },
      description:
        "Three to five broad lowercase hashtags related to the topic or niche.",
    },
  }
}

export function normalizeSocialPostMetadata(
  output: unknown,
  options: { lowercase?: boolean } = {}
): GeneratedSocialPostMetadata {
  const record = isRecord(output) ? output : {}
  const maybeLower = (value: string) =>
    options.lowercase ? value.toLowerCase() : value

  return {
    title: maybeLower(clean(record.title)),
    caption: maybeLower(clean(record.caption)),
    hashtags: normalizeSocialPostHashtags(record.hashtags),
  }
}

export function normalizeSocialPostHashtags(value: unknown) {
  const tags = Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : []

  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().toLowerCase().replace(/^#+/, ""))
        .filter(Boolean)
        .map((tag) => `#${tag}`)
    ),
  ]
}
